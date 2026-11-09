import { db } from '../db/db';
import type { Course, CourseModule, ModuleKind, ModuleStatus } from '../types/domain';
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

export async function getCourseModule(courseId: string, kind: ModuleKind): Promise<CourseModule | undefined> {
  const modules = await getCourseModules(courseId);
  return modules.find(module => module.kind === kind);
}

export async function updateModuleStatus(moduleId: string, status: ModuleStatus): Promise<void> {
  await db.courseModules.update(moduleId, { status });
}

/**
 * The course shown on the home page: an unfinished started course wins,
 * otherwise the newest unstarted AI lesson, then the lowest-numbered course.
 */
export async function getCurrentCourse(): Promise<Course | undefined> {
  const started = await db.courses.where('status').equals('in_progress').toArray();
  if (started.length) {
    return started.sort((a, b) => (b.startedDate ?? '').localeCompare(a.startedDate ?? ''))[0];
  }
  const courses = await listCourses();
  const unstarted = courses.filter(course => course.status === 'not_started');
  const newestAi = unstarted
    .filter(course => course.source === 'ai')
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return newestAi ?? unstarted[0];
}

export async function completeCourse(id: string): Promise<void> {
  await db.transaction('rw', db.courses, async () => {
    const course = await db.courses.get(id);
    if (!course || course.status === 'completed') return;
    await db.courses.put({
      ...course,
      status: 'completed',
      completedDate: todayKey(),
      updatedAt: Date.now()
    });
  });
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
