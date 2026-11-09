import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase, seedSampleCourses } from '../db/seed';
import { getCourseModules, getCurrentCourse, listCourses, startCourse, updateModuleStatus, completeCourse } from './courseRepository';
import { todayKey } from '../utils/date';

describe('course repository', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('seeds sample courses once', async () => {
    expect(await listCourses()).toHaveLength(2);
    expect(await db.courseModules.count()).toBe(8);
    await seedSampleCourses();
    expect(await listCourses()).toHaveLength(2);
    expect(await db.courseModules.count()).toBe(8);
  });

  it('returns modules in lesson order', async () => {
    const modules = await getCourseModules('sample-1');
    expect(modules.map(module => module.kind)).toEqual(['word', 'grammar', 'reading', 'review']);
  });

  it('starts at the first unstarted course', async () => {
    expect((await getCurrentCourse())?.id).toBe('sample-1');
  });

  it('marks a course in progress and keeps the start date', async () => {
    const started = await startCourse('sample-1');
    expect(started?.status).toBe('in_progress');
    expect(started?.startedDate).toBe(todayKey());

    const again = await startCourse('sample-1');
    expect(again?.startedDate).toBe(started?.startedDate);
    expect((await getCurrentCourse())?.id).toBe('sample-1');
    expect((await db.courses.get('sample-1'))?.status).toBe('in_progress');
  });

  it('returns nothing for an unknown course', async () => {
    expect(await startCourse('missing')).toBeUndefined();
  });

  it('updates a module status and keeps it', async () => {
    await updateModuleStatus('sample-1-word', 'graded');
    expect((await db.courseModules.get('sample-1-word'))?.status).toBe('graded');
    expect((await getCourseModules('sample-1'))[0].status).toBe('graded');
    await updateModuleStatus('sample-1-word', 'graded');
    expect(await db.courseModules.count()).toBe(8);
  });

  it('completes a course and moves on to the next one', async () => {
    await startCourse('sample-1');
    await completeCourse('sample-1');
    const completed = await db.courses.get('sample-1');
    expect(completed?.status).toBe('completed');
    expect(completed?.completedDate).toBe(todayKey());
    expect((await getCurrentCourse())?.id).toBe('sample-2');
    await completeCourse('sample-1');
    expect((await db.courses.get('sample-1'))?.completedDate).toBe(todayKey());
  });
});
