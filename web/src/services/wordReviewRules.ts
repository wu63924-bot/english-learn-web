import type { WordReview, WordReviewStatus } from '../types/domain';
import { addDays, startOfDay } from '../utils/date';

/** 认识后排期依次走这些天数，到顶后不再拉长。 */
export const WORD_INTERVALS = [1, 3, 7, 15, 30, 60];

export function nextIntervalDays(status: WordReviewStatus, current: number): number {
  if (status === 'unknown') return 0;
  if (status === 'fuzzy') return Math.max(1, Math.round((current || 1) / 2));
  return WORD_INTERVALS.find(value => value > current) ?? WORD_INTERVALS[WORD_INTERVALS.length - 1];
}

export function dueAtFor(status: WordReviewStatus, intervalDays: number, now: Date): number {
  if (status === 'unknown') return now.getTime();
  return startOfDay(addDays(now, intervalDays)).getTime();
}

export function isWordDue(review: WordReview, now: Date): boolean {
  return review.dueAt <= now.getTime();
}

export function todayKeyOf(timestamp: number): string {
  const date = new Date(timestamp);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export interface WordRatingInput {
  review: WordReview;
  status: WordReviewStatus;
  now?: Date;
}

/** Applies one rating and returns the updated record. */
export function applyWordRating({ review, status, now = new Date() }: WordRatingInput): WordReview {
  const intervalDays = nextIntervalDays(status, review.intervalDays);
  return {
    ...review,
    status,
    intervalDays,
    dueAt: dueAtFor(status, intervalDays, now),
    streak: status === 'known' ? review.streak + 1 : 0,
    lapses: status === 'unknown' ? review.lapses + 1 : review.lapses,
    lastReviewedAt: now.getTime(),
    updatedAt: now.getTime()
  };
}
