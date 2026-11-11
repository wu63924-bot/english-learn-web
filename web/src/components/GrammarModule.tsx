import { useState } from 'react';
import type { CourseModule } from '../types/domain';
import { parseExplainBody, splitExplainPoints } from '../utils/explain';
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
          <summary>
            <span>语法讲解</span>
            <span className="explain-count">{sections.length} 条规则</span>
          </summary>
          {sections.map((section, sectionIndex) => (
            <div key={section.title} className="explain-section">
              <h3 className="explain-title">
                <span className="explain-index">{String(sectionIndex + 1).padStart(2, '0')}</span>
                {section.title}
              </h3>
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
                  <ul key={index} className="explain-points">
                    {splitExplainPoints(block.value).map((point, pointIndex) => (
                      <li key={pointIndex}>{point}</li>
                    ))}
                  </ul>
                )
              ))}
              {section.examples?.length ? (
                <div className="grammar-examples">
                  {section.examples.map(example => (
                    <div className="grammar-example" key={example.en}>
                      <p className="grammar-example-en">{example.en}</p>
                      <p className="grammar-example-zh">{example.zh}</p>
                    </div>
                  ))}
                </div>
              ) : null}
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
