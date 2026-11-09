import { db } from '../db/db';
import type { PendingAiGrade } from '../types/domain';
import { AiError, gradeAnswer, type AiGrade } from './aiClient';
import { saveAiGrade } from '../repositories/answerRepository';
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
export async function processPendingGrades(): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const pending = await db.pendingAi.where('status').equals('pending').toArray();
  let done = 0;
  for (const item of pending) {
    try {
      const grade = await gradeAnswer({
        courseId: item.courseId,
        moduleId: item.moduleId,
        questionId: item.questionId,
        prompt: item.prompt,
        reference: item.reference,
        answer: item.answer,
        keyPoints: item.keyPoints
      });
      await saveAiGrade({
        courseId: item.courseId,
        moduleId: item.moduleId,
        question: { kind: 'translate', id: item.questionId, prompt: item.prompt, reference: item.reference, keyPoints: item.keyPoints },
        value: item.answer,
        status: grade.status,
        feedback: grade.feedback
      });
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
      await db.pendingAi.put({ ...item, status: 'failed', error: reason instanceof Error ? reason.message : '批改失败' });
    }
  }
  return done;
}

export async function pendingGradeCount(): Promise<number> {
  return db.pendingAi.where('status').equals('pending').count();
}

export async function listPendingGrades(): Promise<PendingAiGrade[]> {
  return db.pendingAi.toArray();
}
