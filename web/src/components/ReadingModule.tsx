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
