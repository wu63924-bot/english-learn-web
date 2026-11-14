import type { GradeStatus, Question } from '../types/domain';

export interface QuestionGrade {
  status: GradeStatus;
  feedback?: string;
}

interface Props {
  question: Question;
  value?: string;
  grade?: QuestionGrade;
  saved?: boolean;
  error?: string;
  disabled?: boolean;
  grading?: boolean;
  onChange: (value: string) => void;
  onChoose: (optionId: string) => void;
  onBlur?: () => void;
  onSubmitText?: () => void;
  onAiGrade?: () => void;
  /** 答错后回看对应规则卡 */
  onReviewRule?: () => void;
  ruleLabel?: string;
}

const GRADE_LABELS: Record<GradeStatus, string> = {
  correct: '回答正确',
  incorrect: '回答不对',
  partial: '部分正确',
  uncertain: '暂无法判断'
};

export function QuestionCard({ question, value, grade, saved, error, disabled, grading, onChange, onChoose, onBlur, onSubmitText, onAiGrade, onReviewRule, ruleLabel }: Props) {
  const locked = Boolean(grade && grade.status !== 'uncertain');
  const isCorrectTask = question.kind === 'translate' && question.variant === 'correct';

  return (
    <article className="card question-card">
      <p className="question-prompt">{question.prompt}</p>

      {question.kind === 'translate' && question.instruction && (
        <p className="question-instruction">{question.instruction}</p>
      )}

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
            disabled={locked || disabled}
          />
          {!grade && onSubmitText && (
            <button type="button" className="ghost-button" onClick={onSubmitText} disabled={!(value ?? '').trim() || disabled}>
              检查
            </button>
          )}
        </div>
      )}

      {question.kind === 'translate' && (
        <>
          <textarea
            className="answer-textarea"
            value={value ?? ''}
            onChange={event => onChange(event.target.value)}
            onBlur={onBlur}
            aria-label={isCorrectTask ? '改写答案' : '翻译答案'}
            rows={4}
            placeholder={isCorrectTask ? '写出正确的英文句子' : '写下你的翻译'}
            spellCheck={false}
            disabled={locked || disabled}
          />
          {onAiGrade && !locked && (
            <div className="answer-row">
              <button
                type="button"
                className="ghost-button"
                onClick={onAiGrade}
                disabled={!(value ?? '').trim() || grading}
              >
                {grading ? '正在批改…' : grade?.status === 'uncertain' ? '重新批改' : '请老师批改'}
              </button>
            </div>
          )}
        </>
      )}

      {grade && (
        <div className={`feedback ${grade.status === 'correct' ? 'correct' : grade.status === 'uncertain' ? 'uncertain' : 'incorrect'}`}>
          <strong>{GRADE_LABELS[grade.status]}</strong>
          <span className="saved-hint">已自动保存</span>
          {grade.feedback && <p className="explanation">{grade.feedback}</p>}
          {'explanation' in question && !grade.feedback && question.explanation && <p className="explanation">{question.explanation}</p>}
          {question.kind === 'translate' && (
            <p className="explanation">参考：{question.reference}</p>
          )}
          {onReviewRule && grade.status !== 'correct' && (
            <button type="button" className="ghost-button rule-jump" onClick={onReviewRule}>
              回看规则{ruleLabel ? `：${ruleLabel}` : ''}
            </button>
          )}
        </div>
      )}

      {question.kind === 'translate' && !grade && (
        <p className="draft-hint">
          {saved ? '已保存草稿 · ' : '输入后自动保存 · '}
          开放题可以请 AI 批改；未批改时不会算作错误。
        </p>
      )}

      {question.kind === 'translate' && grade?.status === 'uncertain' && (
        <p className="draft-hint">可以修改译文后重新批改。</p>
      )}

      {error && <p className="error-text">{error}</p>}
    </article>
  );
}
