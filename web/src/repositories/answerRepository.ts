import { db } from '../db/db';
import type { AnswerRecord, Grade, GradeStatus, Question } from '../types/domain';
import { todayKey } from '../utils/date';

/** Deterministic id: re-saving the same question overwrites instead of duplicating. */
export function answerRecordId(courseId: string, moduleId: string, questionId: string): string {
  return `${courseId}:${moduleId}:${questionId}`;
}

export function gradeRecordId(answerId: string): string {
  return `grade:${answerId}`;
}

export interface SaveAnswerInput {
  courseId: string;
  moduleId: string;
  question: Question;
  value: string;
}

function recordOf(input: SaveAnswerInput): AnswerRecord {
  return {
    id: answerRecordId(input.courseId, input.moduleId, input.question.id),
    courseId: input.courseId,
    moduleId: input.moduleId,
    questionId: input.question.id,
    questionKind: input.question.kind,
    value: input.value,
    dateKey: todayKey(),
    updatedAt: Date.now()
  };
}

/** Saves the raw answer without grading (drafts, open questions). */
export async function saveAnswer(input: SaveAnswerInput): Promise<AnswerRecord> {
  const record = recordOf(input);
  await db.answers.put(record);
  return record;
}

export interface SaveGradedAnswerInput extends SaveAnswerInput {
  status: GradeStatus;
  knowledgeIds?: string[];
}

/** Saves the answer and its local grade in one transaction. */
export async function saveGradedAnswer(input: SaveGradedAnswerInput): Promise<{ answer: AnswerRecord; grade: Grade }> {
  const answer = recordOf(input);
  const grade: Grade = {
    id: gradeRecordId(answer.id),
    answerId: answer.id,
    status: input.status,
    source: 'local',
    gradedAt: Date.now(),
    knowledgeIds: input.knowledgeIds ?? []
  };
  await db.transaction('rw', [db.answers, db.grades], async () => {
    await db.answers.put(answer);
    await db.grades.put(grade);
  });
  return { answer, grade };
}

export interface ModuleAnswers {
  answers: AnswerRecord[];
  grades: Map<string, Grade>;
}

export async function getModuleAnswers(courseId: string, moduleId: string): Promise<ModuleAnswers> {
  const answers = await db.answers
    .where('courseId')
    .equals(courseId)
    .and(answer => answer.moduleId === moduleId)
    .toArray();
  const grades = await db.grades.bulkGet(answers.map(answer => gradeRecordId(answer.id)));
  const map = new Map<string, Grade>();
  for (const grade of grades) if (grade) map.set(grade.answerId, grade);
  return { answers, grades: map };
}
