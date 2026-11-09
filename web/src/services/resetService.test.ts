import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import { resetAllData } from './resetService';

describe('reset all data', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('clears learning data and restores the two sample courses', async () => {
    await db.historyDays.put({
      id: 'history-day-1',
      dayNumber: 1,
      topic: 'test',
      source: 'ChatGPT',
      evidence: 'studied',
      answerCount: 1,
      confirmed: true,
      createdAt: 1
    });
    await db.answers.put({
      id: 'course:module:q1',
      courseId: 'sample-1',
      moduleId: 'sample-1-word',
      questionId: 'q1',
      questionKind: 'choice',
      value: 'a',
      dateKey: '2026-11-09',
      updatedAt: 1
    });

    await resetAllData();

    expect(await db.courses.count()).toBe(2);
    expect(await db.studyDays.count()).toBe(0);
    expect(await db.historyDays.count()).toBe(0);
    expect(await db.answers.count()).toBe(0);
    expect((await db.settings.get('app'))?.id).toBe('app');
  });
});
