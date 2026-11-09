import { useState } from 'react';
import type { CourseModule } from '../types/domain';
import { QuizModule } from './QuizModule';

interface Props {
  module: CourseModule<'grammar'>;
  onFinish: () => void;
  finishing: boolean;
}

export function GrammarModule({ module, onFinish, finishing }: Props) {
  const sections = module.content.sections;
  const [showExplain, setShowExplain] = useState(module.status === 'todo');

  return (
    <div className="grammar-module">
      {sections.length > 0 && (
        <details
          className="explain-block"
          open={showExplain}
          onToggle={event => setShowExplain(event.currentTarget.open)}
        >
          <summary>语法讲解</summary>
          {sections.map(section => (
            <div key={section.title} className="explain-section">
              <h3 className="explain-title">{section.title}</h3>
              <p className="explain-body">{section.body}</p>
            </div>
          ))}
        </details>
      )}
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
