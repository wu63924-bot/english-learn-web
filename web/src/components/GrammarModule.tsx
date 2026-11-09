import { useEffect, useState } from 'react';
import type { ChoiceQuestion, CourseModule, GradeStatus } from '../types/domain';
import { getModuleAnswers, saveGradedAnswer } from '../repositories/answerRepository';
import { updateModuleStatus } from '../repositories/courseRepository';
import { gradeChoice } from '../utils/grading';

interface Props {
  module: CourseModule<'grammar'>;
  onFinish: () => void;
  finishing: boolean;
}

export function GrammarModule({ module, onFinish, finishing }: Props) {
  const questions = module.content.questions;
  const sections = module.content.sections;
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, GradeStatus>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getModuleAnswers(module.courseId, module.id)
      .then(({ answers, grades: storedGrades }) => {
        if (!active) return;
        const restoredValues: Record<string, string> = {};
        const restoredGrades: Record<string, GradeStatus> = {};
        for (const answer of answers) {
          restoredValues[answer.questionId] = answer.value ?? '';
          const grade = storedGrades.get(answer.id);
          if (grade) restoredGrades[answer.questionId] = grade.status;
        }
        setValues(restoredValues);
        setGrades(restoredGrades);
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
  }, [module.courseId, module.id]);

  if (!questions.length) return <p className="muted">这个模块没有练习题。</p>;
  if (!loaded) return <p className="muted">正在读取作答记录…</p>;
  if (loadError) return <p className="error-text">{loadError}</p>;

  const question = questions[index];
  const grade = question ? grades[question.id] : undefined;
  const allGraded = questions.every(item => grades[item.id]);
  const isFirst = index === 0;
  const isLast = index === questions.length - 1;

  async function choose(item: ChoiceQuestion, optionId: string) {
    if (grades[item.id] || saving) return;
    const status = gradeChoice(item, optionId);
    setSaving(true);
    setSaveError('');
    setValues(current => ({ ...current, [item.id]: optionId }));
    setGrades(current => ({ ...current, [item.id]: status }));
    try {
      await saveGradedAnswer({
        courseId: module.courseId,
        moduleId: module.id,
        question: item,
        value: optionId,
        status
      });
      if (module.status === 'todo') await updateModuleStatus(module.id, 'draft');
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : '保存失败，请重试');
      setGrades(current => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grammar-module">
      {sections.length > 0 && (
        <details className="explain-block" open={!grade && index === 0}>
          <summary>语法讲解</summary>
          {sections.map(section => (
            <div key={section.title} className="explain-section">
              <h3 className="explain-title">{section.title}</h3>
              <p className="explain-body">{section.body}</p>
            </div>
          ))}
        </details>
      )}

      <div className="module-progress">
        <span>第 {index + 1} / {questions.length} 题</span>
        <span className="dot-row" aria-hidden="true">
          {questions.map((item, dotIndex) => (
            <span key={item.id} className={`dot${grades[item.id] ? ' filled' : ''}${dotIndex === index ? ' current' : ''}`} />
          ))}
        </span>
      </div>

      <article className="card question-card">
        <p className="question-prompt">{question.prompt}</p>
        <div className="choice-list" role="group" aria-label="选项">
          {question.options.map(option => {
            const chosen = values[question.id] === option.id;
            const isAnswer = option.id === question.answerId;
            const classes = ['choice-option'];
            if (chosen) classes.push('chosen');
            if (grade) {
              if (isAnswer) classes.push('right');
              else if (chosen) classes.push('wrong');
            }
            return (
              <button
                key={option.id}
                type="button"
                className={classes.join(' ')}
                onClick={() => { void choose(question, option.id); }}
                disabled={Boolean(grade) || saving}
                aria-pressed={chosen}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {grade && (
          <div className={`feedback ${grade}`}>
            <strong>{grade === 'correct' ? '回答正确' : '回答不对'}</strong>
            <span className="saved-hint">已自动保存</span>
            <p className="explanation">{question.explanation}</p>
          </div>
        )}
        {saveError && <p className="error-text">{saveError}</p>}
      </article>

      <nav className="module-nav">
        <button type="button" className="ghost-button" onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={isFirst}>
          上一题
        </button>
        {isLast ? (
          <button type="button" className="primary-button" onClick={onFinish} disabled={!allGraded || finishing}>
            {finishing ? '正在保存…' : '完成本模块'}
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={() => setIndex(value => Math.min(questions.length - 1, value + 1))}>
            下一题
          </button>
        )}
      </nav>
      {isLast && !allGraded && <p className="notice">还有题目没有作答，答完后才能完成本模块。</p>}
    </div>
  );
}
