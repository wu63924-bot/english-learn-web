import { describe, expect, it } from 'vitest';
import type { ChoiceQuestion, FillQuestion } from '../types/domain';
import { gradeChoice, gradeFill, isAnswered, normalizeAnswer } from './grading';

const choiceQuestion: ChoiceQuestion = {
  kind: 'choice',
  id: 'q1',
  prompt: 'She ___ to work.',
  options: [
    { id: 'a', label: 'go' },
    { id: 'b', label: 'goes' }
  ],
  answerId: 'b',
  explanation: '第三人称单数。'
};

const fillQuestion: FillQuestion = {
  kind: 'fill',
  id: 'q2',
  prompt: "He doesn't ___ coffee.",
  answers: ['like', 'Like'],
  explanation: 'doesn’t 后用原形。'
};

describe('grading', () => {
  it('grades choices against the stored answer id', () => {
    expect(gradeChoice(choiceQuestion, 'b')).toBe('correct');
    expect(gradeChoice(choiceQuestion, 'a')).toBe('incorrect');
  });

  it('normalizes case, spaces, quotes and trailing punctuation', () => {
    expect(normalizeAnswer('  Don’t  ')).toBe("don't");
    expect(normalizeAnswer('DON\'T.')).toBe("don't");
    expect(normalizeAnswer('doesn’t　like')).toBe("doesn't like");
    expect(normalizeAnswer('  ')).toBe('');
  });

  it('accepts equivalent free-text answers', () => {
    expect(gradeFill(fillQuestion, 'like')).toBe('correct');
    expect(gradeFill(fillQuestion, ' LIKE ')).toBe('correct');
    expect(gradeFill(fillQuestion, 'like.')).toBe('correct');
    expect(gradeFill(fillQuestion, 'likes')).toBe('incorrect');
    expect(gradeFill(fillQuestion, '   ')).toBe('incorrect');
  });

  it('counts written answers and graded choices as answered', () => {
    const translate = { kind: 'translate' as const, id: 't1', prompt: '译文', reference: '参考' };
    expect(isAnswered(translate, '她骑车通勤要二十分钟。', undefined)).toBe(true);
    expect(isAnswered(translate, '   ', undefined)).toBe(false);
    expect(isAnswered(choiceQuestion, 'b', 'correct')).toBe(true);
    expect(isAnswered(choiceQuestion, 'b', undefined)).toBe(false);
  });
});
