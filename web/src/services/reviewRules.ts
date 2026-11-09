import type { KnowledgePoint } from '../types/domain';
import { dateKey } from '../utils/date';

/** Simple, explainable spacing: 1 → 3 → 7 days while learning, 14 when mastered. */
export const REVIEW_INTERVALS = {
  needsReview: 1,
  learningFirst: 1,
  learningSecond: 3,
  learningThird: 7,
  mastered: 14
} as const;

export interface AttemptResult {
  point: KnowledgePoint;
  previousStatus: KnowledgePoint['status'];
  nextDue?: string;
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year, month - 1, date);
  value.setDate(value.getDate() + days);
  return dateKey(value);
}

function dueDateFor(point: KnowledgePoint, correct: boolean): { due: string; reason: string } {
  if (!correct) {
    return { due: addDays(point.lastSeenDate ?? dateKey(new Date()), 1), reason: '答错后次日复习' };
  }
  if (point.status === 'needs_review') return { due: addDays(point.lastSeenDate ?? '', 1), reason: '复习答对，仍需再确认一次' };
  if (point.status === 'mastered') return { due: addDays(point.lastSeenDate ?? '', REVIEW_INTERVALS.mastered), reason: '已掌握，延长复习间隔' };
  if (point.correctStreak >= 3) return { due: addDays(point.lastSeenDate ?? '', REVIEW_INTERVALS.learningThird), reason: '连续答对 3 次，间隔拉长到 7 天' };
  if (point.correctStreak === 2) return { due: addDays(point.lastSeenDate ?? '', REVIEW_INTERVALS.learningSecond), reason: '连续答对 2 次，间隔拉长到 3 天' };
  return { due: addDays(point.lastSeenDate ?? '', REVIEW_INTERVALS.learningFirst), reason: '答对一次，明日再巩固' };
}

/**
 * Applies one attempt with hysteresis: a single answer never flips the state.
 * - mastered needs 2 consecutive wrong answers to fall back to needs_review
 * - needs_review needs 2 consecutive correct answers to return to learning
 * - learning becomes mastered after 3 consecutive correct answers
 */
export function applyAttempt(point: KnowledgePoint, correct: boolean, day: string): AttemptResult {
  const previousStatus = point.status;
  const next: KnowledgePoint = {
    ...point,
    lastSeenDate: day,
    updatedAt: Date.now()
  };

  if (correct) {
    next.correctStreak = point.correctStreak + 1;
    next.wrongStreak = 0;
    if (previousStatus === 'unseen') next.status = 'learning';
    else if (previousStatus === 'needs_review' && next.correctStreak >= 2) next.status = 'learning';
    else if (previousStatus === 'learning' && next.correctStreak >= 3) next.status = 'mastered';
  } else {
    next.correctStreak = 0;
    next.wrongStreak = point.wrongStreak + 1;
    if (previousStatus === 'unseen') next.status = 'learning';
    else if (next.wrongStreak >= 2) next.status = 'needs_review';
  }

  const due = dueDateFor(next, correct);
  next.nextReviewDate = due.due;
  next.reviewReason = due.reason;
  return { point: next, previousStatus, nextDue: due.due };
}

export function isDue(point: KnowledgePoint, today: string): boolean {
  if (point.status === 'unseen') return false;
  if (point.status === 'needs_review') return true;
  if (!point.nextReviewDate) return false;
  return point.nextReviewDate <= today;
}

export function dueKnowledge(points: KnowledgePoint[], today: string): KnowledgePoint[] {
  return points
    .filter(point => isDue(point, today))
    .sort((a, b) => (a.nextReviewDate ?? '').localeCompare(b.nextReviewDate ?? '') || a.label.localeCompare(b.label));
}

export function reviewReasonText(point: KnowledgePoint): string {
  if (point.reviewReason) return point.reviewReason;
  if (point.status === 'needs_review') return point.wrongStreak >= 2 ? '连续答错 2 次' : '需要巩固';
  return '到期复习';
}
