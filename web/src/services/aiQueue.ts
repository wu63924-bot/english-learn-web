import { db } from '../db/db';
import type { PendingAiGrade } from '../types/domain';
import { AiError, gradeAnswer, type AiGrade } from './aiClient';
import { answerRecordId, saveAiGrade } from '../repositories/answerRepository';
import { recordKnowledgeAttempt } from './knowledgeUpdate';

export interface QueueGradeInput {
  courseId: string;
  moduleId: string;
  questionId: string;
  prompt: string;
  reference: string;
  answer: string;
  keyPoints?: string[];
  knowledgeIds?: string[];
}

export interface QueueGradeResult {
  queued: boolean;
  grade?: AiGrade;
}

/** Grades now, or stores the request when the proxy is unreachable (offline). */
export async function gradeOrQueue(input: QueueGradeInput): Promise<QueueGradeResult> {
  try {
    const grade = await gradeAnswer(input);
    return { queued: false, grade };
  } catch (reason) {
    if (reason instanceof AiError && (reason.code === 'NETWORK' || reason.code === 'TIMEOUT')) {
      await db.pendingAi.put({
        id: `${input.courseId}:${input.moduleId}:${input.questionId}`,
        courseId: input.courseId,
        moduleId: input.moduleId,
        questionId: input.questionId,
        prompt: input.prompt,
        reference: input.reference,
        answer: input.answer,
        keyPoints: input.keyPoints,
        knowledgeIds: input.knowledgeIds,
        status: 'pending',
        createdAt: Date.now()
      });
      return { queued: true };
    }
    throw reason;
  }
}

/** Retries queued grades; returns how many were completed. Network failures keep them pending. */
let processing: Promise<number> | null = null;

export function processPendingGrades(options: { retryFailed?: boolean } = {}): Promise<number> {
  if (processing) return processing;
  processing = runPendingGrades(options.retryFailed === true).finally(() => {
    processing = null;
  });
  return processing;
}

async function runPendingGrades(retryFailed: boolean): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  if (retryFailed) await requeueFailedGrades();
  const pending = await db.pendingAi.where('status').equals('pending').toArray();
  let done = 0;
  for (const item of pending) {
    try {
      const answerId = answerRecordId(item.courseId, item.moduleId, item.questionId);
      const current = await db.answers.get(answerId);
      if (current && current.value !== item.answer) {
        // The user edited this answer after it was queued. Never overwrite the newer text.
        await db.pendingAi.delete(item.id);
        continue;
      }
      const grade = await gradeAnswer({
        courseId: item.courseId,
        moduleId: item.moduleId,
        questionId: item.questionId,
        prompt: item.prompt,
        reference: item.reference,
        answer: item.answer,
        keyPoints: item.keyPoints
      });
      const latest = await db.answers.get(answerId);
      if (latest && latest.value !== item.answer) {
        await db.pendingAi.delete(item.id);
        continue;
      }
      const saved = await saveAiGrade({
        courseId: item.courseId,
        moduleId: item.moduleId,
        question: { kind: 'translate', id: item.questionId, prompt: item.prompt, reference: item.reference, keyPoints: item.keyPoints },
        value: item.answer,
        status: grade.status,
        feedback: grade.feedback
      });
      if (!saved) {
        // The course or module was deleted while the response was in flight.
        await db.pendingAi.delete(item.id);
        continue;
      }
      if (grade.status === 'correct' || grade.status === 'partial') {
        await recordKnowledgeAttempt(
          { kind: 'translate', id: item.questionId, prompt: item.prompt, reference: item.reference, knowledgeIds: item.knowledgeIds },
          grade.status === 'correct' ? 'correct' : 'wrong'
        );
      }
      await db.pendingAi.delete(item.id);
      done += 1;
    } catch (reason) {
      if (reason instanceof AiError && (reason.code === 'NETWORK' || reason.code === 'TIMEOUT')) {
        break;
      }
      await db.pendingAi.put({
        ...item,
        status: 'failed',
        error: reason instanceof Error ? reason.message : '批改失败',
        failedAt: Date.now()
      });
    }
  }
  return done;
}

/** User-triggered retry: failed items become pending again and keep their original text. */
export async function requeueFailedGrades(): Promise<number> {
  const failed = await db.pendingAi.where('status').equals('failed').toArray();
  if (!failed.length) return 0;
  await db.pendingAi.bulkPut(failed.map(item => ({ ...item, status: 'pending', error: undefined, failedAt: undefined })));
  return failed.length;
}

export async function pendingGradeCount(): Promise<number> {
  return db.pendingAi.where('status').equals('pending').count();
}

export async function failedGradeCount(): Promise<number> {
  return db.pendingAi.where('status').equals('failed').count();
}

export async function listPendingGrades(): Promise<PendingAiGrade[]> {
  return db.pendingAi.toArray();
}
