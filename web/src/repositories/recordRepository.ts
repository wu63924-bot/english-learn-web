import { db } from '../db/db';
import type { Course } from '../types/domain';
import { gradeRecordId } from './answerRepository';

export interface CourseRecord {
  course: Course;
  date: string;
  modulesCompleted: number;
  moduleTotal: number;
  objectiveAnswered: number;
  objectiveCorrect: number;
}

export async function deleteCourseRecord(courseId: string): Promise<void> {
  await db.transaction('rw', [db.courses, db.courseModules, db.answers, db.grades, db.mistakes, db.pendingAi, db.settings], async () => {
    const answers = await db.answers.where('courseId').equals(courseId).toArray();
    await db.grades.bulkDelete(answers.map(answer => gradeRecordId(answer.id)));
    await db.answers.bulkDelete(answers.map(answer => answer.id));
    await db.mistakes.where('courseId').equals(courseId).delete();
    await db.pendingAi.filter(item => item.courseId === courseId).delete();
    await db.courseModules.where('courseId').equals(courseId).delete();
    await db.courses.delete(courseId);
    const settings = await db.settings.get('app');
    if (settings?.currentCourseId === courseId) {
      await db.settings.put({ ...settings, currentCourseId: undefined, updatedAt: Date.now() });
    }
  });
}

export async function listCourseRecords(): Promise<CourseRecord[]> {
  const courses = (await db.courses.toArray()).filter(course => course.status !== 'not_started');
  const records: CourseRecord[] = [];
  for (const course of courses) {
    const [modules, answers] = await Promise.all([
      db.courseModules.where('courseId').equals(course.id).toArray(),
      db.answers.where('courseId').equals(course.id).toArray()
    ]);
    const grades = await db.grades.bulkGet(answers.map(answer => gradeRecordId(answer.id)));
    const gradeByAnswer = new Map<string, string>();
    grades.forEach(grade => {
      if (grade) gradeByAnswer.set(grade.answerId, grade.status);
    });
    const objective = answers.filter(answer => answer.questionKind !== 'translate');
    records.push({
      course,
      date: course.completedDate ?? course.startedDate ?? '',
      modulesCompleted: modules.filter(module => module.status === 'graded').length,
      moduleTotal: modules.length,
      objectiveAnswered: objective.filter(answer => gradeByAnswer.has(answer.id)).length,
      objectiveCorrect: objective.filter(answer => gradeByAnswer.get(answer.id) === 'correct').length
    });
  }
  return records.sort((a, b) => b.date.localeCompare(a.date) || b.course.number - a.course.number);
}
