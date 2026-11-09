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

/** The module with the most recent saved answer, used to resume where the user left off. */
export async function getLastAnsweredModuleId(courseId: string): Promise<string | undefined> {
  const records = await db.answers.where('courseId').equals(courseId).toArray();
  return records.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.moduleId;
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

/** Saves the answer and its local grade in one transaction. Wrong answers enter the mistake list; a correct answer clears the old mistake. */
export async function saveGradedAnswer(input: SaveGradedAnswerInput): Promise<{ answer: AnswerRecord; grade: Grade }> {
  const answer = recordOf(input);
  const now = Date.now();
  const grade: Grade = {
    id: gradeRecordId(answer.id),
    answerId: answer.id,
    status: input.status,
    source: 'local',
    gradedAt: now,
    knowledgeIds: input.knowledgeIds ?? []
  };
  await db.transaction('rw', [db.answers, db.grades, db.mistakes], async () => {
    await db.answers.put(answer);
    await db.grades.put(grade);
    if (input.status === 'incorrect') {
      await db.mistakes.put({
        id: answer.id,
        courseId: answer.courseId,
        moduleId: answer.moduleId,
        questionId: answer.questionId,
        wrongValue: input.value,
        reason: '作答错误',
        createdAt: now,
        updatedAt: now
      });
    } else {
      await db.mistakes.delete(answer.id);
    }
  });
  return { answer, grade };
}

export interface SaveAiGradeInput extends SaveAnswerInput {
  status: GradeStatus;
  feedback: string;
}

/** Saves an AI grade; a correct verdict clears the mistake, a partial one keeps it. */
export async function saveAiGrade(input: SaveAiGradeInput): Promise<void> {
  const answer = recordOf(input);
  const now = Date.now();
  const grade: Grade = {
    id: gradeRecordId(answer.id),
    answerId: answer.id,
    status: input.status,
    source: 'ai',
    feedback: input.feedback,
    gradedAt: now,
    knowledgeIds: []
  };
  await db.transaction('rw', [db.answers, db.grades, db.mistakes], async () => {
    await db.answers.put(answer);
    await db.grades.put(grade);
    if (input.status === 'correct') {
      await db.mistakes.delete(answer.id);
    } else if (input.status === 'partial') {
      await db.mistakes.put({
        id: answer.id,
        courseId: answer.courseId,
        moduleId: answer.moduleId,
        questionId: answer.questionId,
        wrongValue: input.value,
        reason: 'AI 判定部分正确',
        createdAt: now,
        updatedAt: now
      });
    }
  });
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
