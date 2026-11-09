import type { CourseModule } from '../types/domain';
import { QuizModule } from './QuizModule';

interface Props {
  module: CourseModule<'review'>;
  onFinish: () => void;
  finishing: boolean;
}

export function ReviewModule({ module, onFinish, finishing }: Props) {
  return (
    <div className="review-module">
      <QuizModule
        courseId={module.courseId}
        moduleId={module.id}
        moduleStatus={module.status}
        questions={module.content.questions}
        finishing={finishing}
        onFinish={onFinish}
      />
    </div>
  );
}
