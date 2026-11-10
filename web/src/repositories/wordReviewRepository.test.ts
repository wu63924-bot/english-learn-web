import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import {
  countNewWordsToday,
  countWordReviews,
  listDueWordReviews,
  listNewWordCandidates,
  saveWordRating,
  wordStatusesForModule
} from './wordReviewRepository';

const now = new Date(2026, 10, 10, 9, 0, 0);

describe('word review repository', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('keeps one record per written form across courses', async () => {
    await saveWordRating({ term: 'Want', status: 'fuzzy', courseId: 'c1', moduleId: 'm1', wordId: 'w1', meanings: ['v. 想要'], now });
    await saveWordRating({ term: 'want', status: 'known', courseId: 'c2', moduleId: 'm2', wordId: 'w9', meanings: ['v. 需要'], now });

    const all = await db.wordReviews.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].meanings).toEqual(['v. 想要', 'v. 需要']);
    expect(all[0].courseId).toBe('c2');
    expect(all[0].status).toBe('known');
  });

  it('schedules known words forward and unknown words immediately', async () => {
    const known = await saveWordRating({ term: 'decide', status: 'known', now });
    const unknown = await saveWordRating({ term: 'hope', status: 'unknown', now });

    expect(known.intervalDays).toBe(1);
    expect(known.dueAt).toBeGreaterThan(now.getTime());
    expect(unknown.intervalDays).toBe(0);
    expect(unknown.dueAt).toBe(now.getTime());
    expect(unknown.lapses).toBe(1);
  });

  it('lists due words with unknown first', async () => {
    await saveWordRating({ term: 'decide', status: 'unknown', now });
    await saveWordRating({ term: 'hope', status: 'fuzzy', now });
    await saveWordRating({ term: 'plan', status: 'known', now });

    const due = await listDueWordReviews(now);
    expect(due.map(item => item.term)).toEqual(['decide']);

    const tomorrow = new Date(2026, 10, 11, 8, 0, 0);
    expect((await listDueWordReviews(tomorrow)).map(item => item.term)).toEqual(['decide', 'hope', 'plan']);
  });

  it('offers new words from course word lists and respects the limit', async () => {
    const candidates = await listNewWordCandidates(2);
    expect(candidates).toHaveLength(2);

    await saveWordRating({ term: candidates[0].term, status: 'known', now });
    const next = await listNewWordCandidates(5);
    expect(next.some(item => item.term === candidates[0].term)).toBe(false);
  });

  it('counts words first rated today', async () => {
    await saveWordRating({ term: 'decide', status: 'unknown', now });
    await saveWordRating({ term: 'hope', status: 'fuzzy', now });
    await saveWordRating({ term: 'plan', status: 'known', now: new Date(2026, 10, 9, 9, 0, 0) });

    expect(await countNewWordsToday(now)).toBe(2);
    expect(await countWordReviews()).toMatchObject({ learning: 2, known: 1 });
  });

  it('returns statuses for the words of one module', async () => {
    const words = [{ id: 'sample-1-w1', term: 'routine' }, { id: 'sample-1-w2', term: 'commute' }];
    await saveWordRating({ term: 'routine', status: 'fuzzy', now });

    const statuses = await wordStatusesForModule(words);
    expect(statuses).toEqual({ 'sample-1-w1': 'fuzzy' });
  });
});
