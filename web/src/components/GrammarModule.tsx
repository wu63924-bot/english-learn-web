import { useState } from 'react';
import type { CourseModule } from '../types/domain';
import { parseExplainBody } from '../utils/explain';
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
              {parseExplainBody(section.body).map((block, index) => (
                block.type === 'table' ? (
                  <div key={index} className="explain-table-wrap">
                    <table className="explain-table">
                      <thead>
                        <tr>{block.headers.map((header, cell) => <th key={cell}>{header}</th>)}</tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p key={index} className="explain-body">{block.value}</p>
                )
              ))}
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
