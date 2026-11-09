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

  it('prefers the newest unstarted AI lesson over the sample courses', async () => {
    await db.courses.put({
      id: 'ai-21',
      number: 21,
      title: '第 21 课',
      topic: '四级词汇',
      goal: '继续历史进度',
      source: 'ai',
      status: 'not_started',
      createdAt: Date.now() + 1_000,
      updatedAt: Date.now() + 1_000
    });
    expect((await getCurrentCourse())?.id).toBe('ai-21');
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

  it('keeps an unfinished course across days', async () => {
    const started = await startCourse('sample-1');
    await db.courses.put({ ...started!, startedDate: '2026-01-01' });
    const current = await getCurrentCourse();
    expect(current?.id).toBe('sample-1');
    expect(current?.startedDate).toBe('2026-01-01');
  });
});
