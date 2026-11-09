import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import { listWeakWordReviews, listWordReviews, saveWordReview } from './wordReviewRepository';

describe('word review repository', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('stores per-word feedback and lists weak words', async () => {
    await saveWordReview({ courseId: 'ai-22', moduleId: 'ai-22-word', wordId: 'w1', term: 'want', status: 'known' });
    await saveWordReview({ courseId: 'ai-22', moduleId: 'ai-22-word', wordId: 'w2', term: 'decide', status: 'unknown' });
    await saveWordReview({ courseId: 'ai-22', moduleId: 'ai-22-word', wordId: 'w3', term: 'hope', status: 'fuzzy' });

    expect((await listWordReviews('ai-22', 'ai-22-word')).map(item => item.status).sort()).toEqual(['fuzzy', 'known', 'unknown']);
    expect((await listWeakWordReviews()).map(item => item.term).sort()).toEqual(['decide', 'hope']);
  });
});
