import { db } from '../db/db';
import type { Course, CourseModule, ModuleKind, ModuleStatus, PhraseItem } from '../types/domain';
import { todayKey } from '../utils/date';

/** 取若干单词模块的短语表，用于复习卡片给例句做搭配注释。 */
export async function listModulePhrases(moduleIds: string[]): Promise<Record<string, PhraseItem[]>> {
  const unique = [...new Set(moduleIds.filter(Boolean))];
  if (!unique.length) return {};
  const modules = await db.courseModules.bulkGet(unique);
  const result: Record<string, PhraseItem[]> = {};
  for (const module of modules) {
    if (!module || module.kind !== 'word') continue;
    const wordModule = module as CourseModule<'word'>;
    if (wordModule.content.phrases?.length) {
      result[wordModule.id] = wordModule.content.phrases;
    }
  }
  return result;
}

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
 * otherwise the lowest-numbered unstarted AI lesson, then the lowest-numbered course.
 */
/** 把某节课设为当前课程；首页优先显示它。 */
export async function pinCourse(courseId: string): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  await db.settings.put({ ...settings, currentCourseId: courseId, updatedAt: Date.now() });
}

export async function getCurrentCourse(): Promise<Course | undefined> {
  const settings = await db.settings.get('app');
  if (settings?.currentCourseId) {
    const pinned = await db.courses.get(settings.currentCourseId);
    if (pinned) return pinned;
  }
  const started = await db.courses.where('status').equals('in_progress').toArray();
  if (started.length) {
    return started.sort((a, b) => (b.startedDate ?? '').localeCompare(a.startedDate ?? ''))[0];
  }
  const courses = await listCourses();
  const unstarted = courses.filter(course => course.status === 'not_started');
  const nextAi = unstarted
    .filter(course => course.source === 'ai')
    .sort((a, b) => a.number - b.number)[0];
  return nextAi ?? unstarted[0];
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
