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
    const first = applyWordRating({ review: review(), status: 'known', now });
    expect(first.streak).toBe(1);
    expect(first.lapses).toBe(0);
    expect(first.intervalDays).toBe(1);

    const nextDay = new Date(2026, 10, 11, 8, 0, 0);
    const fuzzy = applyWordRating({ review: { ...first, streak: 3 }, status: 'fuzzy', now: nextDay });
    expect(fuzzy.streak).toBe(0);

    const unknown = applyWordRating({ review: { ...fuzzy, lastReviewedAt: nextDay.getTime() }, status: 'unknown', now: nextDay });
    expect(unknown.lapses).toBe(1);
    expect(unknown.intervalDays).toBe(0);
    expect(unknown.dueAt).toBe(nextDay.getTime());
  });

  it('keeps the interval when the same word is rated twice in one day', () => {
    const first = applyWordRating({ review: review(), status: 'known', now });
    let current = first;
    for (let index = 0; index < 5; index += 1) {
      current = applyWordRating({ review: current, status: 'known', now: new Date(now.getTime() + (index + 1) * 60000) });
    }
    expect(current.intervalDays).toBe(1);
    expect(current.streak).toBe(1);
    expect(current.dueAt).toBe(first.dueAt);

    const inferred = applyWordRating({ review: current, status: 'fuzzy', now: new Date(now.getTime() + 120000) });
    expect(inferred.status).toBe('fuzzy');
    expect(inferred.intervalDays).toBe(1);
  });

  it('still resets a word marked unknown on the same day', () => {
    const first = applyWordRating({ review: review(), status: 'known', now });
    const reset = applyWordRating({ review: first, status: 'unknown', now: new Date(now.getTime() + 60000) });
    expect(reset.intervalDays).toBe(0);
    expect(reset.dueAt).toBe(new Date(now.getTime() + 60000).getTime());
    expect(reset.lapses).toBe(1);
  });

  it('schedules a word learned later the same day for tomorrow', () => {
    const missed = applyWordRating({ review: review(), status: 'unknown', now });
    expect(missed.intervalDays).toBe(0);
    const learned = applyWordRating({ review: missed, status: 'known', now: new Date(now.getTime() + 60000) });
    expect(learned.status).toBe('known');
    expect(learned.intervalDays).toBe(1);
    expect(learned.dueAt).toBe(new Date(2026, 10, 11, 0, 0, 0).getTime());
  });
});
