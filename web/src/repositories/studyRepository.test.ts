import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import { addCompletedCourse, addStudySeconds, getStudySummary } from './studyRepository';
import { todayKey } from '../utils/date';

describe('study days', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('accumulates seconds for the same local day', async () => {
    await addStudySeconds(30);
    await addStudySeconds(45);
    const day = await db.studyDays.get(todayKey());
    expect(day?.seconds).toBe(75);
    expect((await getStudySummary()).todayMinutes).toBe(1);
    expect(await db.studyDays.count()).toBe(1);
  });

  it('counts a day only after five minutes or a completed module', async () => {
    await addStudySeconds(299);
    expect((await getStudySummary()).activeDays).toBe(0);
    await addStudySeconds(1);
    expect((await getStudySummary()).activeDays).toBe(1);
  });

  it('marks a day active when a module or course is completed', async () => {
    await addStudySeconds(0, 1);
    expect((await getStudySummary()).activeDays).toBe(1);
    await addCompletedCourse();
    expect((await db.studyDays.get(todayKey()))?.coursesCompleted).toBe(1);
  });

  it('ignores empty updates', async () => {
    await addStudySeconds(0);
    expect(await db.studyDays.count()).toBe(0);
  });
});
