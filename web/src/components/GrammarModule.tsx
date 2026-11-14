import { useState } from 'react';
import type { CourseModule, GrammarSection } from '../types/domain';
import { parseExplainBody, splitExplainPoints } from '../utils/explain';
import { QuizModule } from './QuizModule';

interface Props {
  module: CourseModule<'grammar'>;
  onFinish: () => void;
  finishing: boolean;
}

/** 旧课程没有 rule/pattern，回落到原来的段落排版。 */
function SectionDetails({ section }: { section: GrammarSection }) {
  return (
    <>
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
    </>
  );
}

export function GrammarModule({ module, onFinish, finishing }: Props) {
  const sections = module.content.sections;
  const [showExplain, setShowExplain] = useState(module.status === 'todo');
  const [activeRule, setActiveRule] = useState<number | null>(null);
  const [openZh, setOpenZh] = useState<Record<string, boolean>>({});
  const hasCards = sections.some(section => section.rule || section.pattern || section.trap);

  function focusRule(index: number) {
    setActiveRule(index);
    document.getElementById(`grammar-rule-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => setActiveRule(current => (current === index ? null : current)), 5000);
  }

  function toggleZh(key: string) {
    setOpenZh(current => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="grammar-module">
      {sections.length > 0 && !hasCards && (
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
              <SectionDetails section={section} />
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

      {sections.length > 0 && hasCards && (
        <div className="grammar-cards">
          {sections.map((section, sectionIndex) => {
            const highlighted = activeRule === sectionIndex;
            return (
              <article
                key={section.title}
                id={`grammar-rule-${sectionIndex}`}
                className={`card grammar-card${highlighted ? ' highlighted' : ''}`}
              >
                <header className="grammar-card-head">
                  <span className="grammar-index">{String(sectionIndex + 1).padStart(2, '0')}</span>
                  <h3 className="grammar-title">{section.title}</h3>
                </header>

                {section.rule && <p className="grammar-rule">{section.rule}</p>}

                {section.pattern && (
                  <p className="grammar-pattern">
                    <span className="grammar-label">结构</span>
                    {section.pattern}
                  </p>
                )}

                {section.signal && (
                  <p className="grammar-signal">
                    <span className="grammar-label">信号</span>
                    {section.signal}
                  </p>
                )}

                {section.trap && (
                  <div className="grammar-trap">
                    <p className="grammar-trap-line wrong">
                      <span aria-hidden="true">✗</span>
                      {section.trap.wrong}
                    </p>
                    <p className="grammar-trap-line right">
                      <span aria-hidden="true">✓</span>
                      {section.trap.right}
                    </p>
                    {section.trap.note && <p className="grammar-trap-note">{section.trap.note}</p>}
                  </div>
                )}

                {section.examples?.length ? (
                  <ul className="grammar-examples">
                    {section.examples.map(example => {
                      const key = `${sectionIndex}-${example.en}`;
                      const shown = openZh[key];
                      return (
                        <li key={example.en} className="grammar-example">
                          <p className="grammar-example-en">{example.en}</p>
                          <button
                            type="button"
                            className={`grammar-zh-toggle${shown ? ' shown' : ''}`}
                            onClick={() => toggleZh(key)}
                            aria-expanded={Boolean(shown)}
                          >
                            {shown ? example.zh : '心里翻一下 · 点开译文'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <details className="grammar-detail">
                  <summary>详细讲解</summary>
                  <SectionDetails section={section} />
                </details>
              </article>
            );
          })}
        </div>
      )}
      {hasCards && (
        <p className="grammar-hint">先读规则和结构，再遮住译文练例句；做题答错可以点「回看规则」。</p>
      )}
      <QuizModule
        courseId={module.courseId}
        moduleId={module.id}
        moduleStatus={module.status}
        questions={module.content.questions}
        finishing={finishing}
        onFinish={onFinish}
        onReviewRule={hasCards ? focusRule : undefined}
        ruleLabels={sections.map(section => section.rule)}
      />
    </div>
  );
}
