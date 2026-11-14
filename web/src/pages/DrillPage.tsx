import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ErrorState, LoadingState, PageHeader } from '../components/UI';
import { getOrCreateDrillPlan, listDrillItems, recordDrillResult } from '../repositories/mistakeRepository';
import type { DrillItem } from '../repositories/mistakeRepository';
import { gradeChoice, gradeFill } from '../utils/grading';

function answerText(item: DrillItem): string {
  const question = item.question;
  if (question.kind === 'choice') {
    return question.options.find(option => option.id === question.answerId)?.label ?? '';
  }
  return question.answers.join(' / ');
}

function explanationText(item: DrillItem): string {
  return item.question.explanation;
}

export function DrillPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<DrillItem[]>([]);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ correct: boolean; chosen?: string } | null>(null);
  const [answered, setAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [todayDone, setTodayDone] = useState(0);

  useEffect(() => {
    let alive = true;
    void Promise.all([listDrillItems(), getOrCreateDrillPlan()])
      .then(([list, plan]) => {
        if (!alive) return;
        setItems(list);
        const done = new Set(plan.answeredIds);
        setTodayDone(plan.answeredIds.length);
        const firstOpen = list.findIndex(item => !done.has(item.mistake.id));
        setIndex(firstOpen < 0 ? list.length : firstOpen);
        setLoading(false);
      })
      .catch(reason => {
        if (!alive) return;
        setError(reason instanceof Error ? reason.message : '读取错题失败');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function commit(correct: boolean, chosen?: string) {
    const item = items[index];
    if (!item || saving) return;
    setSaving(true);
    try {
      await recordDrillResult(item.mistake.id, correct);
      setResult({ correct, chosen });
      setAnswered(count => count + 1);
      if (correct) setCorrectCount(count => count + 1);
      setTodayDone(count => count + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存练习结果失败');
    } finally {
      setSaving(false);
    }
  }

  function choose(optionId: string) {
    const item = items[index];
    if (!item || item.question.kind !== 'choice' || result) return;
    void commit(gradeChoice(item.question, optionId) === 'correct', optionId);
  }

  function submitFill() {
    const item = items[index];
    if (!item || item.question.kind !== 'fill' || result) return;
    void commit(gradeFill(item.question, value) === 'correct');
  }

  function next() {
    setResult(null);
    setValue('');
    setIndex(current => current + 1);
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  if (items.length === 0) {
    return (
      <>
        <PageHeader eyebrow="错题巩固" title="今天没有要巩固的题" />
        <p className="muted">答错的题会自动进入题库，这里每天挑出最多 10 道让你重做。</p>
        <button type="button" className="primary-button" onClick={() => navigate('/records')}>回记录</button>
      </>
    );
  }

  const item = items[index];

  if (!item) {
    return (
      <>
        <PageHeader eyebrow="错题巩固" title="这一轮结束了" />
        <div className="today-stats">
          <div><b>{answered}</b><span>本轮做了</span></div>
          <div><b>{correctCount}</b><span>答对</span></div>
          <div><b>{todayDone}</b><span>今日累计</span></div>
        </div>
        {todayDone < items.length && (
          <p className="muted">还有题没做，明天会重新安排。</p>
        )}
        <button type="button" className="primary-button" onClick={() => navigate('/records')}>回记录</button>
      </>
    );
  }

  const question = item.question;

  return (
    <>
      <PageHeader eyebrow="错题巩固" title={`第 ${index + 1} / ${items.length} 题`} />
      <div className="module-progress">
        <span>第 {item.courseNumber} 课 · 答对 {correctCount}</span>
        <span className="word-progress-track" aria-hidden="true">
          <i style={{ width: `${(index / items.length) * 100}%` }} />
        </span>
      </div>

      <article className="card question-card">
        {item.hint && (
          <div className="drill-hint">
            <p className="drill-hint-title">规则提醒 · {item.hint.title}</p>
            {item.hint.rule && <p className="drill-hint-rule">{item.hint.rule}</p>}
            {item.hint.pattern && <p className="drill-hint-pattern">{item.hint.pattern}</p>}
          </div>
        )}
        <p className="question-prompt">{question.prompt}</p>

        {question.kind === 'choice' ? (
          <div className="choice-list" role="group" aria-label="选项">
            {question.options.map(option => {
              const chosen = result?.chosen === option.id;
              const isAnswer = option.id === question.answerId;
              const classes = ['choice-option'];
              if (chosen) classes.push('chosen');
              if (result) {
                if (isAnswer) classes.push('right');
                else if (chosen) classes.push('wrong');
              }
              return (
                <button
                  key={option.id}
                  type="button"
                  className={classes.join(' ')}
                  onClick={() => choose(option.id)}
                  disabled={Boolean(result) || saving}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="answer-row">
              <input
                className="answer-input"
                type="text"
                value={value}
                onChange={event => setValue(event.target.value)}
                aria-label="填空答案"
                autoComplete="off"
                spellCheck={false}
                disabled={Boolean(result) || saving}
              />
              {!result && (
                <button type="button" className="ghost-button" onClick={submitFill} disabled={!value.trim() || saving}>
                  检查
                </button>
              )}
            </div>
            {result && <p className="explanation">正确答案：{answerText(item)}</p>}
          </>
        )}

        {result && (
          <div className={`feedback ${result.correct ? 'correct' : 'incorrect'}`}>
            <strong>{result.correct ? '回答正确' : '回答不对'}</strong>
            <p className="explanation">{explanationText(item)}</p>
            {item.question.kind === 'choice' && <p className="explanation">正确答案：{answerText(item)}</p>}
          </div>
        )}
      </article>

      {result ? (
        <button type="button" className="primary-button" onClick={next}>
          {index + 1 >= items.length ? '完成本轮' : '下一题'}
        </button>
      ) : (
        <p className="draft-hint">答完自动记录；连续答对 2 次的题就不再出现在每日巩固里。</p>
      )}
    </>
  );
}
