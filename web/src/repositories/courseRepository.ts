import { db } from '../db/db';
import type { Course, CourseModule } from '../types/domain';
import { todayKey } from '../utils/date';

export async function listCourses(): Promise<Course[]> {
  const courses = await db.courses.toArray();
  return courses.sort((a, b) => a.number - b.number);
}

export async function getCourse(id: string): Promise<Course | undefined> {
  return db.courses.get(id);
}

export async function getCourseModules(courseId: string): Promise<CourseModule[]> {
  return db.courseModules.where('courseId').equals(courseId).sortBy('order');
}

/**
 * The course shown on the home page: an unfinished started course wins,
 * otherwise the lowest-numbered course that has not started yet.
 */
export async function getCurrentCourse(): Promise<Course | undefined> {
  const started = await db.courses.where('status').equals('in_progress').toArray();
  if (started.length) {
    return started.sort((a, b) => (b.startedDate ?? '').localeCompare(a.startedDate ?? ''))[0];
  }
  const courses = await listCourses();
  return courses.find(course => course.status === 'not_started');
}

export async function startCourse(id: string): Promise<Course | undefined> {
  return db.transaction('rw', db.courses, async () => {
    const course = await db.courses.get(id);
    if (!course) return undefined;
    if (course.status !== 'not_started') return course;
    const updated: Course = {
      ...course,
      status: 'in_progress',
      startedDate: todayKey(),
      updatedAt: Date.now()
    };
    await db.courses.put(updated);
    return updated;
  });
}
