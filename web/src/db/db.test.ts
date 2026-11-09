import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DB_NAME, db } from './db';
import { initializeDatabase } from './seed';

describe('local database', () => {
  it('creates the version 1 tables', async () => {
    await initializeDatabase();
    expect(db.name).toBe(DB_NAME);
    expect(db.tables.map(table => table.name).sort()).toEqual([
      'aiUsage', 'answers', 'courseModules', 'courses', 'grades', 'historyDays',
      'knowledge', 'mistakes', 'pendingAi', 'reviews', 'settings', 'studyDays'
    ]);
  });

  it('writes default settings once and keeps user changes', async () => {
    await initializeDatabase();
    const first = await db.settings.get('app');
    expect(first?.id).toBe('app');
    expect(first?.appVersion).toBe('0.1.0');

    await db.settings.put({ ...first!, dailyGoalMinutes: 20 });
    await initializeDatabase();
    expect((await db.settings.get('app'))?.dailyGoalMinutes).toBe(20);
  });

  it('keeps data after closing and reopening', async () => {
    db.close();
    await initializeDatabase();
    expect((await db.settings.get('app'))?.dailyGoalMinutes).toBe(20);
  });
});
