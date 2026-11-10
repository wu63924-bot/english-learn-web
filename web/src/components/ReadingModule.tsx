import type { CourseModule } from '../types/domain';
import { QuizModule } from './QuizModule';

interface Props {
  module: CourseModule<'reading'>;
  onFinish: () => void;
  finishing: boolean;
}

export function ReadingModule({ module, onFinish, finishing }: Props) {
  const content = module.content;

  return (
    <div className="reading-module">
      <article className="card passage-card">
        <p className="passage-text">{content.passage}</p>
        {content.glossary && content.glossary.length > 0 && (
          <details className="passage-glossary">
            <summary>阅读生词</summary>
            <ul>
              {content.glossary.map(item => (
                <li key={item.term}>
                  <strong>{item.term}</strong>
                  {item.phonetic && <span className="glossary-phonetic">{item.phonetic}</span>}
                  <span className="glossary-meaning">{item.meaning}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {content.passageTranslation && (
          <details className="passage-translation">
            <summary>查看参考译文</summary>
            <p>{content.passageTranslation}</p>
          </details>
        )}
      </article>
      <QuizModule
        courseId={module.courseId}
        moduleId={module.id}
        moduleStatus={module.status}
        questions={content.questions}
        finishing={finishing}
        onFinish={onFinish}
      />
    </div>
  );
}
