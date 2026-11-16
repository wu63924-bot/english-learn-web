import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { CourseModule, WordReview, WordReviewStatus, WordSession } from '../types/domain';
import { countWordReviews, saveWordRating, wordReviewsForModule, wordStatusesForModule } from '../repositories/wordReviewRepository';
import { getStudySummary } from '../repositories/studyRepository';
import { getWordSession, saveWordSession } from '../repositories/settingsRepository';
import { rateSessionWord, resumeWordSession, sessionProgress } from '../services/wordSession';
import { useWordSpeech } from '../hooks/useWordSpeech';
import { examplePhrasesFor } from '../utils/phrases';
import { SpeakerIcon } from './SpeakerIcon';
import { WordSketchPad } from './WordSketchPad';

interface Props {
  module: CourseModule<'word'>;
  alreadyDone: boolean;
  onFinish: () => void;
}

/** 上次学习距今的天数；没有记录就是新词。 */
function ageLabel(review: WordReview | undefined, now: Date): string {
  if (!review || !review.lastReviewedAt) return '新词';
  const days = Math.floor((now.getTime() - review.lastReviewedAt) / 86_400_000);
  if (days <= 0) return '今天学过';
  return `${days} 天前学过`;
}

export function WordModule({ module, alreadyDone, onFinish }: Props) {
  const words = module.content.words;
  const [searchParams] = useSearchParams();
  const targetWord = searchParams.get('word');
  const [session, setSession] = useState<WordSession | null>(null);
  const [reviews, setReviews] = useState<Record<string, WordReviewStatus>>({});
  const [records, setRecords] = useState<Record<string, WordReview>>({});
  const [dueCount, setDueCount] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);

  const ids = useMemo(() => words.map(word => word.id), [words]);
  const currentId = session?.queue[0];
  const word = words.find(item => item.id === currentId) ?? words[0];
  const speech = useWordSpeech(word?.term);

  useEffect(() => {
    let active = true;
    void Promise.all([
      wordStatusesForModule(words),
      wordReviewsForModule(words),
      getWordSession(),
      getStudySummary(),
      countWordReviews()
    ]).then(([statuses, recordsResult, saved, study, counts]) => {
      if (!active) return;
      setReviews(statuses);
      setRecords(recordsResult);
      setDueCount(counts.due);
      setMinutes(study.todayMinutes);
      // 指定了某个词时把它提到队首，方便从课程页直接跳到该词。
      const ordered = targetWord && ids.includes(targetWord)
        ? [targetWord, ...ids.filter(id => id !== targetWord)]
        : ids;
      let next = resumeWordSession(saved, module.id, ordered);
      if (!next.queue.length) next = resumeWordSession(undefined, module.id, ordered);
      setSession(next);
      setRestored(true);
    });
    return () => {
      active = false;
    };
  }, [module.id, ids, targetWord, words]);

  useEffect(() => {
    setRevealed(false);
  }, [currentId]);

  if (!word) return <p className="muted">这个模块没有单词内容。</p>;

  const currentStatus = reviews[word.id];
  const phrases = module.content.phrases ?? [];
  const examplePhrases = examplePhrasesFor(word, phrases);
  const progress = session ? sessionProgress(session) : { mastered: 0, total: words.length, remaining: words.length };
  const currentAge = ageLabel(records[word.id], new Date());
  const total = progress.total || words.length;

  async function rate(status: WordReviewStatus) {
    if (!session || !word || saving) return;
    setSaving(true);
    try {
      const result = rateSessionWord(session, word.id, status);
      setSession(result.session);
      setRevealed(false);
      await saveWordSession(result.session);
      await saveWordRating({
        term: word.term,
        status,
        courseId: module.courseId,
        moduleId: module.id,
        wordId: word.id,
        phonetic: word.phonetic,
        meanings: word.meanings,
        example: word.example,
        exampleTranslation: word.exampleTranslation,
        examplePhrases: examplePhrases.length ? examplePhrases : undefined
      });
      setReviews(current => ({ ...current, [word.id]: status }));
      if (result.finished) onFinish();
    } finally {
      setSaving(false);
    }
  }

  function reveal() {
    if (!revealed) setRevealed(true);
  }

  return (
    <div className="word-module">
      <div className="word-session-stats">
        <div><span>今日新词</span><b>{progress.mastered}/{total}</b></div>
        <div><span>到期复习</span><b>{dueCount}</b></div>
        <div><span>学习时间</span><b>{minutes}m</b></div>
      </div>

      <div className="word-progress-track" aria-hidden="true">
        <i style={{ width: `${(progress.mastered / Math.max(1, total)) * 100}%` }} />
      </div>

      <p className="word-age">{currentAge}</p>

      <article
        className={`card word-card word-card-tap${revealed ? ' revealed' : ''}`}
        onClick={reveal}
        role="button"
        tabIndex={0}
        aria-label={revealed ? `${word.term} 的释义` : '点击查看答案'}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            reveal();
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
        <h2 className="word-term">{word.term}</h2>
        <div className="word-sound">
          {word.phonetic && <span className="word-phonetic">{word.phonetic}</span>}
          {speech.supported && (
            <button
              type="button"
              className="speak-button"
              onClick={event => { event.stopPropagation(); speech.speak(); }}
              aria-label={`朗读 ${word.term}`}
            >
              <SpeakerIcon />
            </button>
          )}
        </div>
        {revealed ? (
          <div className="word-reveal-panel">
            <ul className="word-meanings">
              {word.meanings.map(meaning => <li key={meaning}>{meaning}</li>)}
            </ul>
            <p className="word-example">{word.example}</p>
            <p className="word-example-translation">{word.exampleTranslation}</p>
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
            {word.note && <p className="word-note">{word.note}</p>}
          </div>
        ) : (
          <p className="word-reveal-hint">尝试回想释义<br />点击卡片查看答案</p>
        )}
        <WordSketchPad resetKey={word.id} />
      </article>

      {phrases.length > 0 && (
        <details className="phrase-block">
          <summary>重要短语 · {phrases.length} 条</summary>
          <ul className="phrase-list">
            {phrases.map(item => (
              <li key={item.phrase}>
                <span className="phrase-en">{item.phrase}</span>
                <span className="phrase-zh">{item.meaning}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="word-action-dock">
        {alreadyDone && <p className="notice dock-notice">这个模块已完成过；现在是再练一轮，不影响记录。</p>}
        <div className="word-action-bar word-action-bar-large">
          <button
            type="button"
            className={`word-rate unknown big${currentStatus === 'unknown' ? ' active' : ''}`}
            onClick={() => { if (!revealed) { setRevealed(true); return; } void rate('unknown'); }}
            disabled={saving || !restored}
          >
            不认识
          </button>
          <button
            type="button"
            className={`word-rate fuzzy small${currentStatus === 'fuzzy' ? ' active' : ''}`}
            onClick={() => { reveal(); void rate('fuzzy'); }}
            disabled={saving || !restored}
            aria-label="模糊"
          >
            模糊
          </button>
          <button
            type="button"
            className={`word-rate known big${currentStatus === 'known' ? ' active' : ''}`}
            onClick={() => { void rate('known'); }}
            disabled={saving || !restored}
          >
            我认识
          </button>
        </div>
      </div>
    </div>
  );
}
