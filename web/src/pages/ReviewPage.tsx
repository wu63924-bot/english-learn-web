import { useEffect, useState } from 'react';
import { Card, ErrorState, LoadingState, PageHeader } from '../components/UI';
import { WordReviewSession } from '../components/WordReviewSession';
import { listDueKnowledge, knowledgeCounts, saveKnowledgePoint } from '../repositories/knowledgeRepository';
import {
  countWordReviews,
  listDueWordReviews,
  listNewWordCandidates
} from '../repositories/wordReviewRepository';
import type { NewWordCandidate } from '../repositories/wordReviewRepository';
import { AiError, generateDrill, type DrillResult } from '../services/aiClient';
import { applyAttempt, reviewReasonText } from '../services/reviewRules';
import type { KnowledgePoint, WordReview } from '../types/domain';
import { todayKey } from '../utils/date';

const STATUS_LABELS: Record<KnowledgePoint['status'], string> = {
  unseen: '未学习',
  learning: '学习中',
  needs_review: '需巩固',
  mastered: '已掌握'
};

/** 一轮最多带多少个没学过的词，避免一次排几百张卡。 */
const NEW_WORDS_PER_SESSION = 20;

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
  const [words, setWords] = useState<WordReview[]>([]);
  const [wordDue, setWordDue] = useState(0);
  const [session, setSession] = useState<{ due: WordReview[]; fresh: NewWordCandidate[] } | null>(null);
  const [starting, setStarting] = useState(false);
  const [wordHint, setWordHint] = useState('');
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
    void Promise.all([
      listDueKnowledge(),
      knowledgeCounts(),
      listDueWordReviews(),
      countWordReviews()
    ])
      .then(([due, summary, dueWords, wordSummary]) => {
        if (!alive) return;
        setItems(due);
        setCounts(summary);
        setWords(dueWords);
        setWordDue(wordSummary.due);
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

  async function startWordSession() {
    if (starting) return;
    setStarting(true);
    setWordHint('');
    try {
      const fresh = await listNewWordCandidates(NEW_WORDS_PER_SESSION);
      if (!words.length && !fresh.length) {
        setWordHint('暂时没有到期的词，也没有可学的新词。');
        return;
      }
      setSession({ due: words, fresh });
    } catch (reason) {
      setWordHint(reason instanceof Error ? reason.message : '无法准备单词复习');
    } finally {
      setStarting(false);
    }
  }

  async function refreshWords() {
    try {
      const [dueWords, wordSummary] = await Promise.all([
        listDueWordReviews(),
        countWordReviews()
      ]);
      setWords(dueWords);
      setWordDue(wordSummary.due);
    } catch (reason) {
      setWordHint(reason instanceof Error ? reason.message : '刷新单词列表失败');
    }
  }

  async function finishWordSession() {
    setSession(null);
    await refreshWords();
  }

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

  if (session) {
    return (
      <>
        <PageHeader eyebrow="复习" title="单词复习" subtitle="先回想，再选择掌握程度" />
        <WordReviewSession due={session.due} fresh={session.fresh} onFinish={() => { void finishWordSession(); }} />
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            setSession(null);
            void refreshWords();
          }}
        >
          退出本轮
        </button>
      </>
    );
  }

  const remaining = items.filter(point => !doneIds.has(point.id));

  return (
    <>
      <PageHeader eyebrow="复习" title="今天复习" subtitle="先处理容易忘的内容，再继续新课程" />

      {counts && (
        <div className="review-counts">
          <span>需巩固 <b>{counts.needs_review}</b></span>
          <span>学习中 <b>{counts.learning}</b></span>
          <span>已掌握 <b>{counts.mastered}</b></span>
        </div>
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

      <Card title="单词复习">
        <div className="word-summary">
          <span><b>{wordDue}</b> 个到期</span>
          <span>可学新词最多 20 个</span>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => { void startWordSession(); }}
          disabled={starting}
        >
          {starting ? '正在准备…' : wordDue > 0 ? '开始复习' : '学新词'}
        </button>
        {wordDue === 0 && <p className="muted">今天没有到期的词，可以直接学新词。</p>}
        {wordHint && <p className="muted">{wordHint}</p>}
      </Card>

      <details className="explain-block">
        <summary>复习规则</summary>
        <p className="review-rule">
          知识点：答错一次不会立刻降级；连续答错 2 次进入“需巩固”。需巩固连续答对 2 次回到“学习中”，
          学习中连续答对 3 次进入“已掌握”。已掌握后连续答错 2 次才降回需巩固。间隔按 1 天 → 3 天 → 7 天 → 14 天拉长。
        </p>
        <p className="review-rule">
          单词：认识的间隔按 1 → 3 → 7 → 15 → 30 → 60 天拉长；模糊明天再来、间隔减半；不认识本轮再见一次、间隔归零。
          同一个词在多节课出现只算一个，每一轮最多带 20 个新词。
        </p>
      </details>
    </>
  );
}
