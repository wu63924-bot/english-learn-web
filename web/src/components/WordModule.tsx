import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { CourseModule, WordReviewStatus } from '../types/domain';
import { saveWordRating, wordStatusesForModule } from '../repositories/wordReviewRepository';
import { getModulePosition, saveModulePosition } from '../repositories/modulePositionRepository';
import { useWordSpeech } from '../hooks/useWordSpeech';
import { examplePhrasesFor } from '../utils/phrases';
import { SpeakerIcon } from './SpeakerIcon';
import { WordSketchPad } from './WordSketchPad';

interface Props {
  module: CourseModule<'word'>;
  alreadyDone: boolean;
  onFinish: () => void;
}

export function WordModule({ module, alreadyDone, onFinish }: Props) {
  const words = module.content.words;
  const [searchParams] = useSearchParams();
  const targetWord = searchParams.get('word');
  const [index, setIndex] = useState(0);
  const [reviews, setReviews] = useState<Record<string, WordReviewStatus>>({});
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);
  const word = words[index];
  const speech = useWordSpeech(word?.term);
  const isFirst = index === 0;
  const isLast = index === words.length - 1;

  useEffect(() => {
    setRevealed(false);
  }, [index]);

  useEffect(() => {
    let active = true;
    void Promise.all([wordStatusesForModule(words), getModulePosition(module.id)]).then(([map, position]) => {
      if (!active) return;
      setReviews(map);
      const candidates = [targetWord, position?.wordId].filter((id): id is string => Boolean(id));
      for (const id of candidates) {
        const index = words.findIndex(item => item.id === id);
        if (index >= 0) {
          setIndex(index);
          setRestored(true);
          return;
        }
      }
      const firstUnfinished = words.findIndex(item => map[item.id] !== 'known');
      if (firstUnfinished > 0) setIndex(firstUnfinished);
      setRestored(true);
    });
    return () => {
      active = false;
    };
  }, [module.id, words, targetWord]);

  useEffect(() => {
    if (!restored || !word) return;
    void saveModulePosition(module.id, { wordId: word.id });
  }, [module.id, restored, word?.id]);

  async function rate(status: WordReviewStatus) {
    if (!word || saving) return;
    setSaving(true);
    try {
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
      if (isLast) {
        onFinish();
        return;
      }
      setIndex(value => value + 1);
      setRevealed(false);
    } finally {
      setSaving(false);
    }
  }

  if (!word) return <p className="muted">这个模块没有单词内容。</p>;

  const currentStatus = reviews[word.id];
  const phrases = module.content.phrases ?? [];
  const examplePhrases = examplePhrasesFor(word, phrases);

  return (
    <div className="word-module">
      <div className="module-progress">
        <span>第 {index + 1} / {words.length} 个</span>
        <span className="word-progress-track" aria-hidden="true">
          <i style={{ width: `${((index + 1) / words.length) * 100}%` }} />
        </span>
      </div>

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

      <article className="card word-card">
        <div className="word-card-top">
          <p className="word-tag">{revealed ? '已揭示' : '先回忆'}</p>
          {speech.supported && (
            <button
              type="button"
              className={`auto-speak${speech.autoSpeak ? ' on' : ''}`}
              onClick={speech.toggle}
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
            <button type="button" className="speak-button" onClick={speech.speak} aria-label={`朗读 ${word.term}`}>
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
          <p className="word-reveal-hint">还记得它的意思吗？点「显示答案」核对。</p>
        )}
        <WordSketchPad resetKey={word.id} />
      </article>

      <div className={`word-action-dock${revealed ? ' revealed' : ''}`}>
        {alreadyDone && <p className="notice dock-notice">这个模块已完成，可以随时回来重看。</p>}
        <div className="word-action-bar">
          <button type="button" className="ghost-button dock-back" onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={isFirst || saving}>
            上一个
          </button>
          {revealed ? (
            <div className="word-feedback" role="group" aria-label="单词掌握程度">
              <button type="button" className={`word-rate known${currentStatus === 'known' ? ' active' : ''}`} onClick={() => { void rate('known'); }} disabled={saving}>
                认识
              </button>
              <button type="button" className={`word-rate fuzzy${currentStatus === 'fuzzy' ? ' active' : ''}`} onClick={() => { void rate('fuzzy'); }} disabled={saving}>
                模糊
              </button>
              <button type="button" className={`word-rate unknown${currentStatus === 'unknown' ? ' active' : ''}`} onClick={() => { void rate('unknown'); }} disabled={saving}>
                不认识
              </button>
            </div>
          ) : (
            <button type="button" className="primary-button" onClick={() => setRevealed(true)}>
              显示答案
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
