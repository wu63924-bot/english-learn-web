import { useState } from 'react';
import type { CourseModule } from '../types/domain';

interface Props {
  module: CourseModule<'word'>;
  alreadyDone: boolean;
  busy: boolean;
  onFinish: () => void;
}

export function WordModule({ module, alreadyDone, busy, onFinish }: Props) {
  const words = module.content.words;
  const [index, setIndex] = useState(0);
  const word = words[index];
  const isFirst = index === 0;
  const isLast = index === words.length - 1;

  if (!word) return <p className="muted">这个模块没有单词内容。</p>;

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
        <ul className="word-meanings">
          {word.meanings.map(meaning => <li key={meaning}>{meaning}</li>)}
        </ul>
        <p className="word-example">{word.example}</p>
        <p className="word-example-translation">{word.exampleTranslation}</p>
        {word.note && <p className="word-note">{word.note}</p>}
      </article>

      <nav className="module-nav">
        <button type="button" className="ghost-button" onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={isFirst}>
          上一个
        </button>
        {isLast ? (
          <button type="button" className="primary-button" onClick={onFinish} disabled={busy}>
            {busy ? '正在保存…' : alreadyDone ? '回到课程' : '完成单词模块'}
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={() => setIndex(value => Math.min(words.length - 1, value + 1))}>
            下一个
          </button>
        )}
      </nav>
      {alreadyDone && <p className="notice">这个模块已完成，可以随时回来重看。</p>}
    </div>
  );
}
