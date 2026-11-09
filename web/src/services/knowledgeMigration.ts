import { db } from '../db/db';
import type { CourseModule, KnowledgePoint, Question } from '../types/domain';
import { normalizeKnowledgeLabel } from '../utils/knowledge';

const RANK: Record<KnowledgePoint['status'], number> = {
  unseen: 1,
  learning: 2,
  needs_review: 3,
  mastered: 4
};

function later(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function earliest(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function merge(group: KnowledgePoint[]): KnowledgePoint {
  const canonical = [...group].sort((a, b) => {
    const rank = RANK[b.status] - RANK[a.status];
    if (rank) return rank;
    const attempts = (b.correctStreak + b.wrongStreak) - (a.correctStreak + a.wrongStreak);
    if (attempts) return attempts;
    return a.updatedAt - b.updatedAt;
  })[0];
  return {
    ...canonical,
    correctStreak: Math.max(...group.map(point => point.correctStreak)),
    wrongStreak: Math.max(...group.map(point => point.wrongStreak)),
    correctDayStreak: Math.max(...group.map(point => point.correctDayStreak ?? 0)),
    lastSeenDate: group.map(point => point.lastSeenDate).reduce(later, undefined),
    lastCorrectDate: group.map(point => point.lastCorrectDate).reduce(later, undefined),
    nextReviewDate: group.map(point => point.nextReviewDate).reduce(earliest, undefined),
    reviewReason: canonical.reviewReason ?? group.find(point => point.reviewReason)?.reviewReason,
    confirmed: group.some(point => point.confirmed) || undefined,
    updatedAt: Math.max(...group.map(point => point.updatedAt))
  };
}

function remapQuestions(questions: Question[], ids: Map<string, string>): boolean {
  let changed = false;
  for (const question of questions) {
    if (!question.knowledgeIds?.length) continue;
    const next = [...new Set(question.knowledgeIds.map(id => ids.get(id) ?? id))];
    if (next.length !== question.knowledgeIds.length || next.some((id, index) => id !== question.knowledgeIds?.[index])) {
      question.knowledgeIds = next;
      changed = true;
    }
  }
  return changed;
}

function remapModule(module: CourseModule, ids: Map<string, string>): boolean {
  const content = module.content as { questions?: Question[]; knowledgeIds?: string[] };
  let changed = false;
  if (content.questions) changed = remapQuestions(content.questions, ids) || changed;
  if (content.knowledgeIds) {
    const next = [...new Set(content.knowledgeIds.map(id => ids.get(id) ?? id))];
    if (next.length !== content.knowledgeIds.length || next.some((id, index) => id !== content.knowledgeIds?.[index])) {
      content.knowledgeIds = next;
      changed = true;
    }
  }
  return changed;
}

/**
 * Merges knowledge points that share the same normalized label and rewrites every
 * reference. Runs once; the flag keeps later boots cheap.
 */
export async function unifyKnowledge(): Promise<number> {
  const settings = await db.settings.get('app');
  if (settings?.knowledgeUnifiedAt) return 0;

  const points = await db.knowledge.toArray();
  const groups = new Map<string, KnowledgePoint[]>();
  for (const point of points) {
    const key = normalizeKnowledgeLabel(point.label);
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }

  const ids = new Map<string, string>();
  const merged: KnowledgePoint[] = [];
  const remove: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const canonical = merge(group);
    merged.push(canonical);
    for (const point of group) {
      if (point.id !== canonical.id) {
        ids.set(point.id, canonical.id);
        remove.push(point.id);
      }
    }
  }

  if (ids.size) {
    await db.transaction('rw', [db.knowledge, db.courseModules, db.grades, db.reviews, db.mistakes, db.pendingAi, db.settings], async () => {
      await db.knowledge.bulkDelete(remove);
      await db.knowledge.bulkPut(merged);

      const modules = await db.courseModules.toArray();
      const changedModules = modules.filter(module => remapModule(module, ids));
      if (changedModules.length) await db.courseModules.bulkPut(changedModules);

      const grades = await db.grades.toArray();
      const changedGrades = grades.filter(grade => grade.knowledgeIds.some(id => ids.has(id)));
      for (const grade of changedGrades) {
        grade.knowledgeIds = [...new Set(grade.knowledgeIds.map(id => ids.get(id) ?? id))];
      }
      if (changedGrades.length) await db.grades.bulkPut(changedGrades);

      const reviews = await db.reviews.toArray();
      const changedReviews = reviews.filter(review => ids.has(review.knowledgeId));
      for (const review of changedReviews) review.knowledgeId = ids.get(review.knowledgeId) ?? review.knowledgeId;
      if (changedReviews.length) await db.reviews.bulkPut(changedReviews);

      const mistakes = await db.mistakes.toArray();
      const changedMistakes = mistakes.filter(mistake => mistake.knowledgeId && ids.has(mistake.knowledgeId));
      for (const mistake of changedMistakes) mistake.knowledgeId = ids.get(mistake.knowledgeId!) ?? mistake.knowledgeId;
      if (changedMistakes.length) await db.mistakes.bulkPut(changedMistakes);

      const pending = await db.pendingAi.toArray();
      const changedPending = pending.filter(item => item.knowledgeIds?.some(id => ids.has(id)));
      for (const item of changedPending) {
        item.knowledgeIds = [...new Set((item.knowledgeIds ?? []).map(id => ids.get(id) ?? id))];
      }
      if (changedPending.length) await db.pendingAi.bulkPut(changedPending);

      const current = await db.settings.get('app');
      if (current) await db.settings.put({ ...current, knowledgeUnifiedAt: Date.now(), updatedAt: Date.now() });
    });
  } else if (settings) {
    await db.settings.put({ ...settings, knowledgeUnifiedAt: Date.now(), updatedAt: Date.now() });
  }

  return ids.size;
}
