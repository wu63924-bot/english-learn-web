import { useState } from 'react';
import { Link } from 'react-router';
import type { NewWordCandidate } from '../repositories/wordReviewRepository';
import { saveWordRating } from '../repositories/wordReviewRepository';
import type { WordReview, WordReviewStatus } from '../types/domain';
import { WordSketchPad } from './WordSketchPad';

interface QueueItem {
  key: string;
  term: string;
  phonetic?: string;
  meanings?: string[];
  example?: string;
  exampleTranslation?: string;
  courseId?: string;
  moduleId?: string;
  wordId?: string;
  /** 已经在本轮里出现过一次，不再重复排队 */
  attempt: number;
}

export interface SessionResult {
  rated: number;
  known: number;
}

function fromReview(review: WordReview): QueueItem {
  return {
    key: review.id,
    term: review.term,
    phonetic: review.phonetic,
    meanings: review.meanings,
    example: review.example,
    exampleTranslation: review.exampleTranslation,
    courseId: review.courseId,
    moduleId: review.moduleId,
    wordId: review.wordId,
    attempt: 0
  };
}

function fromCandidate(word: NewWordCandidate): QueueItem {
  return {
    key: `new:${word.term}`,
    term: word.term,
    phonetic: word.phonetic,
    meanings: word.meanings,
    example: word.example,
    exampleTranslation: word.exampleTranslation,
    courseId: word.courseId,
    moduleId: word.moduleId,
    wordId: word.wordId,
    attempt: 0
  };
}

interface Props {
  due: WordReview[];
  fresh: NewWordCandidate[];
  onFinish: () => void;
  onExit: () => void;
}

export function WordReviewSession({ due, fresh, onFinish, onExit }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>(() => [...due.map(fromReview), ...fresh.map(fromCandidate)]);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rated, setRated] = useState(0);
  const [known, setKnown] = useState(0);
  const total = due.length + fresh.length;
  const current = queue[0];

  async function rate(status: WordReviewStatus) {
    if (!current || busy) return;
    setBusy(true);
    setError('');
    try {
      await saveWordRating({
        term: current.term,
        status,
        courseId: current.courseId,
        moduleId: current.moduleId,
        wordId: current.wordId,
        phonetic: current.phonetic,
        meanings: current.meanings,
        example: current.example,
        exampleTranslation: current.exampleTranslation
      });
      const rest = queue.slice(1);
      const replay = status === 'unknown' && current.attempt === 0;
      setQueue(replay ? [...rest, { ...current, attempt: 1 }] : rest);
      if (status === 'known') setKnown(value => value + 1);
      setRated(value => value + 1);
      setRevealed(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  if (!current) {
    return (
      <section className="word-session card">
        <p className="word-session-done">这一轮过完了。</p>
        <div className="today-stats">
          <div><b>{rated}</b><span>评过</span></div>
          <div><b>{known}</b><span>认识</span></div>
          <div><b>{rated - known}</b><span>再看</span></div>
        </div>
        <button type="button" className="primary-button" onClick={() => onFinish()}>
          返回复习
        </button>
      </section>
    );
  }

  const position = total - queue.length + 1;

  return (
    <section className="word-session">
      <div className="word-session-top">
        <button type="button" className="word-session-exit" onClick={onExit}>退出</button>
        <span>还剩 {queue.length} 个</span>
        <span>{position} / {total}</span>
      </div>
      <div className="word-progress-track word-session-track" aria-hidden="true">
        <i style={{ width: `${((position - 1) / Math.max(1, total)) * 100}%` }} />
      </div>

      <article className="card word-card">
        <p className="word-tag">{revealed ? '已揭示' : '先回忆'}</p>
        <h2 className="word-term">{current.term}</h2>
        {current.phonetic && <p className="word-phonetic">{current.phonetic}</p>}
        {revealed ? (
          <div className="word-reveal-panel">
            {current.meanings?.length ? (
              <ul className="word-meanings">
                {current.meanings.map(meaning => <li key={meaning}>{meaning}</li>)}
              </ul>
            ) : (
              <p className="word-meanings">暂时没有释义，可回原文查看。</p>
            )}
            {current.example && <p className="word-example">{current.example}</p>}
            {current.exampleTranslation && <p className="word-example-translation">{current.exampleTranslation}</p>}
            {current.courseId && current.moduleId && current.wordId && (
              <Link
                className="word-source-link"
                to={`/course/${current.courseId}/module/word?word=${encodeURIComponent(current.wordId)}`}
              >
                看原文
              </Link>
            )}
          </div>
        ) : (
          <p className="word-reveal-hint">还记得它的意思吗？想起来后点“显示答案”。</p>
        )}
        <WordSketchPad resetKey={current.key} />
      </article>

      {error && <p className="error-text">{error}</p>}

      <div className="word-session-actions">
        {revealed ? (
          <div className="word-feedback" role="group" aria-label="单词掌握程度">
            <button type="button" className="word-rate known" onClick={() => { void rate('known'); }} disabled={busy}>认识</button>
            <button type="button" className="word-rate fuzzy" onClick={() => { void rate('fuzzy'); }} disabled={busy}>模糊</button>
            <button type="button" className="word-rate unknown" onClick={() => { void rate('unknown'); }} disabled={busy}>不认识</button>
          </div>
        ) : (
          <button type="button" className="primary-button" onClick={() => setRevealed(true)}>
            显示答案
          </button>
        )}
      </div>
    </section>
  );
}
