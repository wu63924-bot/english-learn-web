import type { GradeStatus, Question } from '../types/domain';

interface Props {
  question: Question;
  value?: string;
  grade?: GradeStatus;
  saved?: boolean;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onChoose: (optionId: string) => void;
  onBlur?: () => void;
  onSubmitText?: () => void;
}

export function QuestionCard({ question, value, grade, saved, error, disabled, onChange, onChoose, onBlur, onSubmitText }: Props) {
  return (
    <article className="card question-card">
      <p className="question-prompt">{question.prompt}</p>

      {question.kind === 'choice' && (
        <div className="choice-list" role="group" aria-label="选项">
          {question.options.map(option => {
            const chosen = value === option.id;
            const isAnswer = option.id === question.answerId;
            const classes = ['choice-option'];
            if (chosen) classes.push('chosen');
            if (grade) {
              if (isAnswer) classes.push('right');
              else if (chosen) classes.push('wrong');
            }
            return (
              <button
                key={option.id}
                type="button"
                className={classes.join(' ')}
                onClick={() => onChoose(option.id)}
                disabled={Boolean(grade) || disabled}
                aria-pressed={chosen}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {question.kind === 'fill' && (
        <div className="answer-row">
          <input
            className="answer-input"
            type="text"
            value={value ?? ''}
            onChange={event => onChange(event.target.value)}
            onBlur={onBlur}
            aria-label="填空答案"
            autoComplete="off"
            spellCheck={false}
            disabled={Boolean(grade) || disabled}
          />
          {!grade && onSubmitText && (
            <button type="button" className="ghost-button" onClick={onSubmitText} disabled={!(value ?? '').trim() || disabled}>
              检查
            </button>
          )}
        </div>
      )}

      {question.kind === 'translate' && (
        <textarea
          className="answer-textarea"
          value={value ?? ''}
          onChange={event => onChange(event.target.value)}
          onBlur={onBlur}
          aria-label="翻译答案"
          rows={4}
          placeholder="写下你的翻译"
          spellCheck={false}
        />
      )}

      {grade && (
        <div className={`feedback ${grade}`}>
          <strong>{grade === 'correct' ? '回答正确' : '回答不对'}</strong>
          <span className="saved-hint">已自动保存</span>
          {'explanation' in question && <p className="explanation">{question.explanation}</p>}
        </div>
      )}

      {question.kind === 'translate' && !grade && (
        <p className="draft-hint">
          {saved ? '已保存草稿 · ' : '输入后自动保存 · '}
          开放题将在接入 AI 后批改，可以先保存草稿。
        </p>
      )}

      {error && <p className="error-text">{error}</p>}
    </article>
  );
}
