import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import type { WordReview } from '../types/domain';
import { migrateWordReviews } from './wordReviewMigration';

function legacy(input: { id: string; courseId: string; term: string; status: WordReview['status']; updatedAt: number }): WordReview {
  return {
    id: input.id,
    courseId: input.courseId,
    moduleId: `${input.courseId}-word`,
    wordId: input.id,
    term: input.term,
    status: input.status,
    updatedAt: input.updatedAt
  } as unknown as WordReview;
}

describe('word review migration', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
    await db.settings.delete('app');
    await db.settings.put({
      id: 'app',
      appVersion: '0.1.0',
      updatedAt: Date.now()
    });
  });

  it('merges per-course rows into one row per written form', async () => {
    await db.wordReviews.bulkPut([
      legacy({ id: 'c1:m1:w1', courseId: 'c1', term: 'Want', status: 'fuzzy', updatedAt: 1000 }),
      legacy({ id: 'c2:m2:w4', courseId: 'c2', term: 'want', status: 'unknown', updatedAt: 2000 }),
      legacy({ id: 'c3:m3:w2', courseId: 'c3', term: 'decide', status: 'known', updatedAt: 1500 })
    ]);

    expect(await migrateWordReviews()).toBe(2);

    const all = await db.wordReviews.toArray();
    const want = all.find(item => item.id === 'w:want');
    expect(want).toMatchObject({
      status: 'unknown',
      intervalDays: 0,
      streak: 0,
      firstSeenAt: 1000,
      lastReviewedAt: 2000,
      courseId: 'c2'
    });
    const decide = all.find(item => item.id === 'w:decide');
    expect(decide?.status).toBe('known');
    expect(decide?.intervalDays).toBe(7);
    expect(decide?.dueAt).toBeGreaterThan(Date.now());

    const settings = await db.settings.get('app');
    expect(settings?.wordReviewsMigratedAt).toBeGreaterThan(0);
  });

  it('runs only once', async () => {
    await db.wordReviews.put(legacy({ id: 'c1:m1:w1', courseId: 'c1', term: 'want', status: 'fuzzy', updatedAt: 1000 }));
    expect(await migrateWordReviews()).toBe(1);
    expect(await migrateWordReviews()).toBe(0);
  });
});
