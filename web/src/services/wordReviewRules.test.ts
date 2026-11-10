import { describe, expect, it } from 'vitest';
import { applyWordRating, dueAtFor, nextIntervalDays } from './wordReviewRules';
import type { WordReview } from '../types/domain';

const now = new Date(2026, 10, 10, 9, 30, 0);

function review(overrides: Partial<WordReview> = {}): WordReview {
  return {
    id: 'w:want',
    term: 'want',
    status: 'fuzzy',
    intervalDays: 0,
    dueAt: now.getTime(),
    streak: 0,
    lapses: 0,
    firstSeenAt: now.getTime(),
    lastReviewedAt: 0,
    updatedAt: now.getTime(),
    ...overrides
  };
}

describe('word review rules', () => {
  it('walks known words up the ladder 1 → 3 → 7 → 15 → 30 → 60', () => {
    expect(nextIntervalDays('known', 0)).toBe(1);
    expect(nextIntervalDays('known', 1)).toBe(3);
    expect(nextIntervalDays('known', 3)).toBe(7);
    expect(nextIntervalDays('known', 7)).toBe(15);
    expect(nextIntervalDays('known', 15)).toBe(30);
    expect(nextIntervalDays('known', 30)).toBe(60);
    expect(nextIntervalDays('known', 60)).toBe(60);
  });

  it('halves the interval for fuzzy and resets for unknown', () => {
    expect(nextIntervalDays('fuzzy', 7)).toBe(4);
    expect(nextIntervalDays('fuzzy', 0)).toBe(1);
    expect(nextIntervalDays('unknown', 30)).toBe(0);
  });

  it('schedules the next local midnight', () => {
    expect(dueAtFor('known', 3, now)).toBe(new Date(2026, 10, 13, 0, 0, 0).getTime());
    expect(dueAtFor('fuzzy', 1, now)).toBe(new Date(2026, 10, 11, 0, 0, 0).getTime());
    expect(dueAtFor('unknown', 0, now)).toBe(now.getTime());
  });

  it('updates streaks and lapses on rating', () => {
    const known = applyWordRating({ review: review(), status: 'known', now });
    expect(known.streak).toBe(1);
    expect(known.lapses).toBe(0);
    expect(known.intervalDays).toBe(1);

    const fuzzy = applyWordRating({ review: { ...known, streak: 3 }, status: 'fuzzy', now });
    expect(fuzzy.streak).toBe(0);

    const unknown = applyWordRating({ review: fuzzy, status: 'unknown', now });
    expect(unknown.lapses).toBe(1);
    expect(unknown.intervalDays).toBe(0);
    expect(unknown.dueAt).toBe(now.getTime());
  });
});
