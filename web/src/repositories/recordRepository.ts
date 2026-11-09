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
