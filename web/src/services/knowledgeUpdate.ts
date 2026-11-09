import { db } from '../db/db';
import type { Question } from '../types/domain';
import { todayKey } from '../utils/date';
import { applyAttempt } from './reviewRules';

export type AttemptOutcome = 'correct' | 'wrong';

/**
 * Feeds a course answer into the knowledge state machine.
 * Only questions that carry knowledgeIds are affected; unknown ids are skipped.
 */
export async function recordKnowledgeAttempt(question: Question, outcome: AttemptOutcome, day: string = todayKey()): Promise<void> {
  const ids = question.knowledgeIds ?? [];
  if (!ids.length) return;
  await db.transaction('rw', db.knowledge, async () => {
    for (const id of ids) {
      const point = await db.knowledge.get(id);
      if (!point) continue;
      const result = applyAttempt(point, outcome === 'correct', day);
      await db.knowledge.put(result.point);
    }
  });
}
