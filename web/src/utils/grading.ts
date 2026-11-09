import type { ChoiceQuestion, FillQuestion } from '../types/domain';

export type LocalGradeStatus = 'correct' | 'incorrect';

/**
 * Normalizes free-text answers: full-width to half-width, curly quotes to straight,
 * collapsed spaces, case-insensitive, and trailing punctuation removed.
 */
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?。！？]+$/, '')
    .trim()
    .toLowerCase();
}

export function gradeChoice(question: ChoiceQuestion, optionId: string): LocalGradeStatus {
  return optionId === question.answerId ? 'correct' : 'incorrect';
}

export function gradeFill(question: FillQuestion, value: string): LocalGradeStatus {
  const normalized = normalizeAnswer(value);
  if (!normalized) return 'incorrect';
  return question.answers.some(answer => normalizeAnswer(answer) === normalized) ? 'correct' : 'incorrect';
}
