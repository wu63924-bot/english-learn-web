import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { CourseModule, WordReviewStatus } from '../types/domain';
import { listWordReviews, saveWordReview } from '../repositories/wordReviewRepository';

interface Props {
  module: CourseModule<'word'>;
  alreadyDone: boolean;
  busy: boolean;
  onFinish: () => void;
}

export function WordModule({ module, alreadyDone, busy, onFinish }: Props) {
  const words = module.content.words;
  const [searchParams] = useSearchParams();
  const targetWord = searchParams.get('word');
  const [index, setIndex] = useState(0);
  const [reviews, setReviews] = useState<Record<string, WordReviewStatus>>({});
  const [revealed, setRevealed] = useState(false);
  const word = words[index];
  const isFirst = index === 0;
  const isLast = index === words.length - 1;

  useEffect(() => {
    setRevealed(false);
  }, [index]);

  useEffect(() => {
    let active = true;
    void listWordReviews(module.courseId, module.id).then(items => {
      if (!active) return;
      const map: Record<string, WordReviewStatus> = {};
      for (const item of items) map[item.wordId] = item.status;
      setReviews(map);
      const target = targetWord;
      const targetIndex = target ? words.findIndex(item => item.id === target) : -1;
      if (targetIndex >= 0) {
        setIndex(targetIndex);
        return;
      }
      const firstUnfinished = words.findIndex(item => map[item.id] !== 'known');
      if (firstUnfinished > 0) setIndex(firstUnfinished);
    });
    return () => {
      active = false;
    };
  }, [module.courseId, module.id, words, targetWord]);

  async function rate(status: WordReviewStatus) {
    if (!word) return;
    await saveWordReview({
      courseId: module.courseId,
      moduleId: module.id,
      wordId: word.id,
      term: word.term,
      status
    });
    setReviews(current => ({ ...current, [word.id]: status }));
    setRevealed(true);
  }

  if (!word) return <p className="muted">这个模块没有单词内容。</p>;

  const currentStatus = reviews[word.id];

  return (
    <div className="word-module">
      <div className="module-progress">
        <span>第 {index + 1} / {words.length} 个</span>
        <span className="dot-row" aria-hidden="true">
          {words.map((item, dotIndex) => (
            <span key={item.id} className={`dot${dotIndex <= index ? ' filled' : ''}`} />
          ))}
        </span>
      </div>

      <article className="card word-card">
        <h2 className="word-term">{word.term}</h2>
        {word.phonetic && <p className="word-phonetic">{word.phonetic}</p>}
        {revealed ? (
          <>
            <ul className="word-meanings">
              {word.meanings.map(meaning => <li key={meaning}>{meaning}</li>)}
            </ul>
            <p className="word-example">{word.example}</p>
            <p className="word-example-translation">{word.exampleTranslation}</p>
            {word.note && <p className="word-note">{word.note}</p>}
          </>
        ) : (
          <p className="word-reveal-hint">先选择“认识 / 模糊 / 不认识”，再显示释义和例句。</p>
        )}
      </article>

      <div className="word-feedback" role="group" aria-label="单词掌握程度">
        <button type="button" className={`word-rate known${currentStatus === 'known' ? ' active' : ''}`} onClick={() => { void rate('known'); }}>
          认识
        </button>
        <button type="button" className={`word-rate fuzzy${currentStatus === 'fuzzy' ? ' active' : ''}`} onClick={() => { void rate('fuzzy'); }}>
          模糊
        </button>
        <button type="button" className={`word-rate unknown${currentStatus === 'unknown' ? ' active' : ''}`} onClick={() => { void rate('unknown'); }}>
          不认识
        </button>
      </div>

      <nav className="module-nav">
        <button type="button" className="ghost-button" onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={isFirst}>
          上一个
        </button>
        {isLast ? (
          <button type="button" className="primary-button" onClick={onFinish} disabled={busy || !revealed}>
            {busy ? '正在保存…' : alreadyDone ? '回到课程' : '完成单词模块'}
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={() => setIndex(value => Math.min(words.length - 1, value + 1))} disabled={!revealed}>
            下一个
          </button>
        )}
      </nav>
      {alreadyDone && <p className="notice">这个模块已完成，可以随时回来重看。</p>}
    </div>
  );
}
