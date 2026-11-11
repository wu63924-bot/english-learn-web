import { useEffect, useRef, useState } from 'react';
import type { ChoiceQuestion, FillQuestion, ModuleStatus, Question, TranslateQuestion } from '../types/domain';
import { getModuleAnswers, saveAiGrade, saveAnswer, saveGradedAnswer } from '../repositories/answerRepository';
import { updateModuleStatus } from '../repositories/courseRepository';
import { gradeOrQueue, listPendingGrades } from '../services/aiQueue';
import { getModulePosition, saveModulePosition } from '../repositories/modulePositionRepository';
import { AiError } from '../services/aiClient';
import { recordKnowledgeAttempt } from '../services/knowledgeUpdate';
import { gradeChoice, gradeFill, isAnswered } from '../utils/grading';
import { QuestionCard, type QuestionGrade } from './QuestionCard';

interface Props {
  courseId: string;
  moduleId: string;
  moduleStatus: ModuleStatus;
  questions: Question[];
  finishing: boolean;
  onFinish: () => void;
}

export function QuizModule({ courseId, moduleId, moduleStatus, questions, finishing, onFinish }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, QuestionGrade>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [queuedIds, setQueuedIds] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [grading, setGrading] = useState(false);

  const stateRef = useRef({ values, grades });
  stateRef.current = { values, grades };
  const timers = useRef<Record<string, number>>({});
  const draftMarked = useRef(moduleStatus !== 'todo');

  useEffect(() => {
    let active = true;
    void Promise.all([getModuleAnswers(courseId, moduleId), listPendingGrades(), getModulePosition(moduleId)]).then(([{ answers, grades: storedGrades }, pending, position]) => {
        if (!active) return;
        const restoredValues: Record<string, string> = {};
        const restoredGrades: Record<string, QuestionGrade> = {};
        const restoredSaved = new Set<string>();
        for (const answer of answers) {
          restoredValues[answer.questionId] = answer.value ?? '';
          if ((answer.value ?? '').trim()) restoredSaved.add(answer.questionId);
          const grade = storedGrades.get(answer.id);
          if (grade) restoredGrades[answer.questionId] = { status: grade.status, feedback: grade.feedback };
        }
        setValues(restoredValues);
        setGrades(restoredGrades);
        setSavedIds(restoredSaved);
        setQueuedIds(new Set(pending.filter(item => item.status === 'pending' && item.moduleId === moduleId).map(item => item.questionId)));
        const lastIndex = position?.questionId ? questions.findIndex(item => item.id === position.questionId) : -1;
        if (lastIndex >= 0) setIndex(lastIndex);
        setLoaded(true);
      })
      .catch(reason => {
        if (!active) return;
        setLoadError(reason instanceof Error ? reason.message : '读取作答记录失败');
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [courseId, moduleId, questions]);

  useEffect(() => {
    if (!loaded) return;
    const current = questions[index];
    if (!current) return;
    void saveModulePosition(moduleId, { questionId: current.id });
  }, [loaded, moduleId, index, questions]);

  async function markDraft() {
    if (draftMarked.current) return;
    draftMarked.current = true;
    try {
      await updateModuleStatus(moduleId, 'draft');
    } catch {
      draftMarked.current = false;
    }
  }

  async function persist(questionId: string) {
    const question = questions.find(item => item.id === questionId);
    const value = stateRef.current.values[questionId];
    if (!question || value === undefined) return;
    try {
      await saveAnswer({ courseId, moduleId, question, value });
      setSavedIds(current => {
        const next = new Set(current);
        next.add(questionId);
        return next;
      });
      setErrors(current => {
        if (!current[questionId]) return current;
        const next = { ...current };
        delete next[questionId];
        return next;
      });
      await markDraft();
    } catch (reason) {
      setErrors(current => ({
        ...current,
        [questionId]: reason instanceof Error ? reason.message : '草稿保存失败'
      }));
    }
  }

  async function flushDrafts(): Promise<void> {
    const written: Promise<void>[] = [];
    for (const question of questions) {
      if (question.kind === 'choice') continue;
      window.clearTimeout(timers.current[question.id]);
      written.push(persist(question.id));
    }
    await Promise.all(written);
  }

  useEffect(() => {
    const flushAll = () => {
      void flushDrafts();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };
    window.addEventListener('pagehide', flushAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushAll);
      document.removeEventListener('visibilitychange', onVisibility);
      flushAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!questions.length) return <p className="muted">这个模块没有题目。</p>;
  if (!loaded) return <p className="muted">正在读取作答记录…</p>;
  if (loadError) return <p className="error-text">{loadError}</p>;

  const question = questions[index];
  const grade = question ? grades[question.id] : undefined;
  const allAnswered = questions.every(item => isAnswered(item, values[item.id], grades[item.id]?.status));
  const isFirst = index === 0;
  const isLast = index === questions.length - 1;

  function handleText(item: Question, value: string) {
    setValues(current => ({ ...current, [item.id]: value }));
    setSavedIds(current => {
      if (!current.has(item.id)) return current;
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    setGrades(current => {
      const existing = current[item.id];
      if (!existing || existing.status !== 'uncertain') return current;
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    window.clearTimeout(timers.current[item.id]);
    timers.current[item.id] = window.setTimeout(() => {
      void persist(item.id);
    }, 400);
  }

  function blurText(item: Question) {
    window.clearTimeout(timers.current[item.id]);
    void persist(item.id);
  }

  async function choose(item: ChoiceQuestion, optionId: string) {
    if (grades[item.id] || saving) return;
    const status = gradeChoice(item, optionId);
    setSaving(true);
    setValues(current => ({ ...current, [item.id]: optionId }));
    setGrades(current => ({ ...current, [item.id]: { status } }));
    try {
      await saveGradedAnswer({ courseId, moduleId, question: item, value: optionId, status });
      await recordKnowledgeAttempt(item, status === 'correct' ? 'correct' : 'wrong');
      await markDraft();
    } catch (reason) {
      setErrors(current => ({ ...current, [item.id]: reason instanceof Error ? reason.message : '保存失败，请重试' }));
      setGrades(current => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } finally {
      setSaving(false);
    }
  }

  async function submitFill(item: FillQuestion) {
    const value = values[item.id] ?? '';
    if (!value.trim() || grades[item.id] || saving) return;
    const status = gradeFill(item, value);
    setSaving(true);
    setGrades(current => ({ ...current, [item.id]: { status } }));
    try {
      await saveGradedAnswer({ courseId, moduleId, question: item, value, status });
      await recordKnowledgeAttempt(item, status === 'correct' ? 'correct' : 'wrong');
      setSavedIds(current => new Set(current).add(item.id));
      await markDraft();
    } catch (reason) {
      setErrors(current => ({ ...current, [item.id]: reason instanceof Error ? reason.message : '保存失败，请重试' }));
      setGrades(current => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } finally {
      setSaving(false);
    }
  }

  async function requestAiGrade(item: TranslateQuestion) {
    const value = values[item.id] ?? '';
    if (!value.trim() || grading) return;
    setGrading(true);
    setErrors(current => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    try {
      const outcome = await gradeOrQueue({
        courseId,
        moduleId,
        questionId: item.id,
        prompt: item.prompt,
        reference: item.reference,
        answer: value,
        keyPoints: item.keyPoints,
        knowledgeIds: item.knowledgeIds
      });
      if (outcome.queued || !outcome.grade) {
        setQueuedIds(current => new Set(current).add(item.id));
        return;
      }
      const result = outcome.grade;
      await saveAiGrade({ courseId, moduleId, question: item, value, status: result.status, feedback: result.feedback });
      if (result.status === 'correct') await recordKnowledgeAttempt(item, 'correct');
      else if (result.status === 'partial') await recordKnowledgeAttempt(item, 'wrong');
      setQueuedIds(current => {
        if (!current.has(item.id)) return current;
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setGrades(current => ({ ...current, [item.id]: { status: result.status, feedback: result.feedback } }));
      setSavedIds(current => new Set(current).add(item.id));
      await markDraft();
    } catch (reason) {
      const message = reason instanceof AiError ? reason.message : reason instanceof Error ? reason.message : 'AI 批改失败';
      setErrors(current => ({ ...current, [item.id]: message }));
    } finally {
      setGrading(false);
    }
  }

  async function finish() {
    await flushDrafts();
    onFinish();
  }

  return (
    <div className="quiz-module">
      <div className="module-progress">
        <span>第 {index + 1} / {questions.length} 题</span>
        <span className="dot-row" aria-hidden="true">
          {questions.map((item, dotIndex) => (
            <span key={item.id} className={`dot${isAnswered(item, values[item.id], grades[item.id]?.status) ? ' filled' : ''}${dotIndex === index ? ' current' : ''}`} />
          ))}
        </span>
      </div>

      <QuestionCard
        question={question}
        value={values[question.id]}
        grade={grade}
        saved={savedIds.has(question.id)}
        error={errors[question.id]}
        disabled={saving}
        grading={grading}
        onChange={value => handleText(question, value)}
        onChoose={optionId => { void choose(question as ChoiceQuestion, optionId); }}
        onBlur={() => blurText(question)}
        onSubmitText={question.kind === 'fill' ? () => { void submitFill(question); } : undefined}
        onAiGrade={question.kind === 'translate' ? () => { void requestAiGrade(question); } : undefined}
      />

      {queuedIds.has(question.id) && (
        <p className="notice">批改已排队：当前无法连接 AI，联网后会自动批改并记录。</p>
      )}

      <nav className="module-nav">
        <button type="button" className="ghost-button" onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={isFirst}>
          上一题
        </button>
        {isLast ? (
          <button type="button" className="primary-button" onClick={() => { void finish(); }} disabled={!allAnswered || finishing}>
            {finishing ? '正在保存…' : '完成本模块'}
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={() => setIndex(value => Math.min(questions.length - 1, value + 1))}>
            下一题
          </button>
        )}
      </nav>
      {isLast && !allAnswered && <p className="notice">还有题目没有作答，答完后才能完成本模块。</p>}
    </div>
  );
}
