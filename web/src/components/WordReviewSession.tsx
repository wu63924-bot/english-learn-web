import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { NewWordCandidate } from '../repositories/wordReviewRepository';
import { saveWordRating } from '../repositories/wordReviewRepository';
import { getWordSession, saveWordSession } from '../repositories/settingsRepository';
import type { WordReview, WordReviewStatus, WordSession } from '../types/domain';
import type { PhraseItem } from '../types/domain';
import { rateSessionWord, resumeWordSession, sessionProgress } from '../services/wordSession';
import { todayKey } from '../utils/date';
import { useWordSpeech } from '../hooks/useWordSpeech';
import { examplePhrasesFor } from '../utils/phrases';
import { SpeakerIcon } from './SpeakerIcon';
import { WordSketchPad } from './WordSketchPad';

interface QueueItem {
  key: string;
  term: string;
  phonetic?: string;
  meanings?: string[];
  example?: string;
  exampleTranslation?: string;
  examplePhrases?: PhraseItem[];
  courseId?: string;
  moduleId?: string;
  wordId?: string;
  /** 上次复习距今的天数，用于卡片顶部的提示 */
  ageDays?: number;
}

export interface SessionResult {
  rated: number;
  known: number;
}

function daysSince(timestamp: number | undefined, now: Date): number | undefined {
  if (!timestamp) return undefined;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

function fromReview(review: WordReview): QueueItem {
  return {
    key: review.id,
    term: review.term,
    phonetic: review.phonetic,
    meanings: review.meanings,
    example: review.example,
    exampleTranslation: review.exampleTranslation,
    examplePhrases: review.examplePhrases,
    courseId: review.courseId,
    moduleId: review.moduleId,
    wordId: review.wordId,
    ageDays: daysSince(review.lastReviewedAt, new Date())
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
    examplePhrases: word.examplePhrases,
    courseId: word.courseId,
    moduleId: word.moduleId,
    wordId: word.wordId
  };
}

interface Props {
  due: WordReview[];
  fresh: NewWordCandidate[];
  modulePhrases: Record<string, PhraseItem[]>;
  onFinish: () => void;
  onExit: () => void;
}

export function WordReviewSession({ due, fresh, modulePhrases, onFinish, onExit }: Props) {
  const items = useMemo(() => [...due.map(fromReview), ...fresh.map(fromCandidate)], [due, fresh]);
  const byKey = useMemo(() => new Map(items.map(item => [item.key, item])), [items]);
  const scope = `review:${todayKey()}`;
  const keys = useMemo(() => items.map(item => item.key), [items]);
  const keySignature = keys.join('|');

  const [session, setSession] = useState<WordSession | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getWordSession(scope).then(saved => {
      if (!active) return;
      let next = resumeWordSession(saved, scope, keySignature ? keySignature.split('|') : []);
      if (!next.queue.length) next = resumeWordSession(undefined, scope, keySignature ? keySignature.split('|') : []);
      setSession(next);
    });
    return () => {
      active = false;
    };
  }, [scope, keySignature]);

  const current = session ? byKey.get(session.queue[0]) : undefined;
  const speech = useWordSpeech(current?.term);
  const examplePhrases = current
    ? examplePhrasesFor(
      { example: current.example ?? '', examplePhrases: current.examplePhrases },
      current.moduleId ? modulePhrases[current.moduleId] ?? [] : []
    )
    : [];

  useEffect(() => {
    setRevealed(false);
  }, [current?.key]);

  async function rate(status: WordReviewStatus) {
    if (!session || !current || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = rateSessionWord(session, current.key, status);
      setSession(result.session);
      setRevealed(false);
      await saveWordSession(result.session);
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return <section className="word-session card"><p className="muted">正在准备复习…</p></section>;
  }

  if (!current) {
    const progress = sessionProgress(session);
    return (
      <section className="word-session card">
        <p className="word-session-done">这一轮过完了。</p>
        <div className="today-stats">
          <div><b>{progress.mastered}</b><span>已掌握</span></div>
          <div><b>{progress.total}</b><span>本轮</span></div>
          <div><b>{session.queue.length}</b><span>还剩</span></div>
        </div>
        <button type="button" className="primary-button" onClick={() => onFinish()}>
          返回复习
        </button>
      </section>
    );
  }

  const progress = sessionProgress(session);
  const ageText = current.ageDays === undefined
    ? '新词'
    : current.ageDays <= 0 ? '今天学过' : `${current.ageDays} 天前学过`;

  return (
    <section className="word-session">
      <div className="word-session-stats">
        <div><span>本轮</span><b>{progress.mastered}/{progress.total}</b></div>
        <div><span>还剩</span><b>{progress.remaining}</b></div>
        <div><span>到期</span><b>{due.length}</b></div>
      </div>

      <div className="word-session-top">
        <button type="button" className="word-session-exit" onClick={onExit}>退出</button>
        <span>{ageText}</span>
      </div>

      <div className="word-progress-track word-session-track" aria-hidden="true">
        <i style={{ width: `${(progress.mastered / Math.max(1, progress.total)) * 100}%` }} />
      </div>

      <article
        className={`card word-card word-card-tap${revealed ? ' revealed' : ''}`}
        onClick={() => { if (!revealed) setRevealed(true); }}
        role="button"
        tabIndex={0}
        aria-label={revealed ? `${current.term} 的释义` : '点击查看答案'}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setRevealed(true);
          }
        }}
      >
        <div className="word-card-top">
          <p className="word-tag">{revealed ? '已揭示' : '先回忆'}</p>
          {speech.supported && (
            <button
              type="button"
              className={`auto-speak${speech.autoSpeak ? ' on' : ''}`}
              onClick={event => { event.stopPropagation(); speech.toggle(); }}
              aria-pressed={speech.autoSpeak}
            >
              自动读{speech.autoSpeak ? '开' : '关'}
            </button>
          )}
        </div>
        <h2 className="word-term">{current.term}</h2>
        <div className="word-sound">
          {current.phonetic && <span className="word-phonetic">{current.phonetic}</span>}
          {speech.supported && (
            <button
              type="button"
              className="speak-button"
              onClick={event => { event.stopPropagation(); speech.speak(); }}
              aria-label={`朗读 ${current.term}`}
            >
              <SpeakerIcon />
            </button>
          )}
        </div>
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
            {examplePhrases.length > 0 && (
              <ul className="example-phrases">
                {examplePhrases.map(item => (
                  <li key={item.phrase}>
                    <span className="example-phrase-en">{item.phrase}</span>
                    <span className="example-phrase-zh">{item.meaning}</span>
                  </li>
                ))}
              </ul>
            )}
            {current.courseId && current.moduleId && current.wordId && (
              <Link
                className="word-source-link"
                to={`/course/${current.courseId}/module/word?word=${encodeURIComponent(current.wordId)}`}
                onClick={event => event.stopPropagation()}
              >
                看原文
              </Link>
            )}
          </div>
        ) : (
          <p className="word-reveal-hint">尝试回想释义<br />点击卡片查看答案</p>
        )}
        <WordSketchPad resetKey={current.key} />
      </article>

      {error && <p className="error-text">{error}</p>}

      <div className="word-action-dock">
        <div className="word-action-bar word-action-bar-large">
          <button
            type="button"
            className="word-rate unknown big"
            onClick={() => { if (!revealed) { setRevealed(true); return; } void rate('unknown'); }}
            disabled={busy}
          >
            不认识
          </button>
          <button
            type="button"
            className="word-rate fuzzy small"
            onClick={() => { setRevealed(true); void rate('fuzzy'); }}
            disabled={busy}
            aria-label="模糊"
          >
            模糊
          </button>
          <button
            type="button"
            className="word-rate known big"
            onClick={() => { void rate('known'); }}
            disabled={busy}
          >
            我认识
          </button>
        </div>
      </div>
    </section>
  );
}
