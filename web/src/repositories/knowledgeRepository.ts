import { db } from '../db/db';
import type { KnowledgePoint } from '../types/domain';
import { todayKey } from '../utils/date';
import { dueKnowledge } from '../services/reviewRules';

export async function listKnowledge(): Promise<KnowledgePoint[]> {
  return db.knowledge.toArray();
}

export async function listDueKnowledge(today: string = todayKey()): Promise<KnowledgePoint[]> {
  return dueKnowledge(await db.knowledge.toArray(), today);
}

/** Labels of points that need review, used to steer the next generated course. */
export async function listWeakLabels(limit = 6): Promise<string[]> {
  const points = await db.knowledge.toArray();
  return points
    .filter(point => point.status === 'needs_review')
    .slice(0, limit)
    .map(point => point.label);
}

export async function saveKnowledgePoint(point: KnowledgePoint): Promise<void> {
  await db.knowledge.put(point);
}

export async function knowledgeCounts(): Promise<Record<KnowledgePoint['status'], number>> {
  const points = await db.knowledge.toArray();
  return {
    unseen: points.filter(point => point.status === 'unseen').length,
    learning: points.filter(point => point.status === 'learning').length,
    needs_review: points.filter(point => point.status === 'needs_review').length,
    mastered: points.filter(point => point.status === 'mastered').length
  };
}
