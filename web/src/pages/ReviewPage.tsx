import { useEffect, useState } from 'react';
import { Card, ErrorState, LoadingState, PageHeader } from '../components/UI';
import { listDueKnowledge, knowledgeCounts, saveKnowledgePoint } from '../repositories/knowledgeRepository';
import { AiError, generateDrill, type DrillResult } from '../services/aiClient';
import { applyAttempt, reviewReasonText } from '../services/reviewRules';
import type { KnowledgePoint } from '../types/domain';
import { todayKey } from '../utils/date';

const STATUS_LABELS: Record<KnowledgePoint['status'], string> = {
  unseen: '未学习',
  learning: '学习中',
  needs_review: '需巩固',
  mastered: '已掌握'
};

interface Result {
  correct: boolean;
  explanation: string;
  nextDue?: string;
  status: KnowledgePoint['status'];
  reason?: string;
}

export function ReviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState<KnowledgePoint[]>([]);
  const [counts, setCounts] = useState<Record<KnowledgePoint['status'], number> | null>(null);
  const [active, setActive] = useState<KnowledgePoint | null>(null);
  const [drill, setDrill] = useState<DrillResult | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([listDueKnowledge(), knowledgeCounts()])
      .then(([due, summary]) => {
        if (!alive) return;
        setItems(due);
        setCounts(summary);
      })
      .catch(reason => {
        if (alive) setError(reason instanceof Error ? reason.message : '读取复习列表失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function start(item: KnowledgePoint) {
    setActive(item);
    setDrill(null);
    setSelected(null);
    setResult(null);
    setDrillError('');
    setDrillLoading(true);
    try {
      setDrill(await generateDrill({ label: item.label }));
    } catch (reason) {
      setDrillError(reason instanceof AiError ? reason.message : reason instanceof Error ? reason.message : '出题失败');
    } finally {
      setDrillLoading(false);
    }
  }

  async function choose(optionId: string) {
    if (!active || !drill || result || busy) return;
    const correct = optionId === drill.answerId;
    setSelected(optionId);
    setBusy(true);
    try {
      const outcome = applyAttempt(active, correct, todayKey());
      await saveKnowledgePoint(outcome.point);
      const nextDone = new Set(doneIds);
      nextDone.add(active.id);
      setDoneIds(nextDone);
      setResult({
        correct,
        explanation: drill.explanation,
        nextDue: outcome.nextDue,
        status: outcome.point.status,
        reason: outcome.point.reviewReason
      });
      const [due, summary] = await Promise.all([listDueKnowledge(), knowledgeCounts()]);
      setCounts(summary);
      setItems(due.filter(point => !nextDone.has(point.id)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存复习结果失败');
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setActive(null);
    setDrill(null);
    setSelected(null);
    setResult(null);
    setDrillError('');
    const nextItem = items.find(point => !doneIds.has(point.id));
    if (nextItem) void start(nextItem);
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const remaining = items.filter(point => !doneIds.has(point.id));

  return (
    <>
      <PageHeader eyebrow="复习" title="到期复习" subtitle="答错多的内容先复习，稳定后再拉长间隔" />

      {counts && (
        <p className="review-counts">
          需巩固 {counts.needs_review} · 学习中 {counts.learning} · 已掌握 {counts.mastered}
        </p>
      )}

      {active ? (
        <Card>
          <div className="review-head">
            <span className="review-label">{active.label}</span>
            <span className={`review-badge status-${active.status}`}>{STATUS_LABELS[active.status]}</span>
          </div>
          <p className="review-reason">进入复习：{reviewReasonText(active)}</p>

          {drillLoading && <p className="muted">正在出题…</p>}
          {drillError && (
            <div>
              <p className="error-text">{drillError}</p>
              <div className="button-row">
                <button type="button" className="ghost-button" onClick={() => { void start(active); }}>重试</button>
                <button type="button" className="ghost-button" onClick={next}>跳过</button>
              </div>
            </div>
          )}

          {drill && !result && (
            <>
              <p className="question-prompt">{drill.prompt}</p>
              <div className="choice-list" role="group" aria-label="选项">
                {drill.options.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    className={`choice-option${selected === option.id ? ' chosen' : ''}`}
                    onClick={() => { void choose(option.id); }}
                    disabled={busy}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {drill && result && (
            <>
              <div className={`feedback ${result.correct ? 'correct' : 'incorrect'}`}>
                <strong>{result.correct ? '回答正确' : '回答不对'}</strong>
                <span className="saved-hint">状态：{STATUS_LABELS[result.status]}</span>
                <p className="explanation">{result.explanation}</p>
              </div>
              <p className="review-next">
                {result.reason}{result.nextDue ? ` · 下次复习 ${result.nextDue}` : ''}
              </p>
              <button type="button" className="primary-button" onClick={next}>
                {remaining.length > 0 ? '继续下一个' : '完成本次复习'}
              </button>
            </>
          )}
        </Card>
      ) : (
        <Card title="待复习">
          {remaining.length === 0 ? (
            <p className="muted">今天没有到期复习。学习新课程或复习后，这里会自动排期。</p>
          ) : (
            <ul className="review-list">
              {remaining.map(point => (
                <li key={point.id} className="review-item">
                  <div className="review-main">
                    <span className="review-label">{point.label}</span>
                    <span className="review-reason">{reviewReasonText(point)}</span>
                  </div>
                  <button type="button" className="ghost-button" onClick={() => { void start(point); }}>
                    复习
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <details className="explain-block">
        <summary>复习规则</summary>
        <p className="explain-body">
          答错一次不会立刻降级；连续答错 2 次进入“需巩固”。需巩固连续答对 2 次回到“学习中”，
          学习中连续答对 3 次进入“已掌握”。已掌握后连续答错 2 次才降回需巩固。
          间隔按 1 天 → 3 天 → 7 天 → 14 天拉长。
        </p>
      </details>
    </>
  );
}
