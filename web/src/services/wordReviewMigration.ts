import { db } from '../db/db';
import type { WordReview, WordReviewStatus } from '../types/domain';
import { normalizeWordTerm, wordReviewId } from '../utils/wordTerm';
import { startOfDay } from '../utils/date';

const RANK: Record<WordReviewStatus, number> = { unknown: 0, fuzzy: 1, known: 2 };

function initialInterval(status: WordReviewStatus): number {
  if (status === 'known') return 7;
  if (status === 'fuzzy') return 1;
  return 0;
}

function dueAtFor(status: WordReviewStatus, now: number): number {
  if (status === 'known') {
    const next = startOfDay(new Date(now));
    next.setDate(next.getDate() + 7);
    return next.getTime();
  }
  if (status === 'fuzzy') {
    const next = startOfDay(new Date(now));
    next.setDate(next.getDate() + 1);
    return next.getTime();
  }
  return now;
}

/**
 * v4 stored one row per course word. v5 keeps one row per written form, so old
 * rows are grouped by normalized term and merged; the weakest status wins so a
 * word is never marked known by accident.
 */
export async function migrateWordReviews(): Promise<number> {
  const settings = await db.settings.get('app');
  if (settings?.wordReviewsMigratedAt) return 0;

  const items = await db.wordReviews.toArray();
  const legacy = items.filter(item => typeof item.intervalDays !== 'number' || typeof item.dueAt !== 'number');
  if (!legacy.length) {
    if (settings) await db.settings.put({ ...settings, wordReviewsMigratedAt: Date.now(), updatedAt: Date.now() });
    return 0;
  }

  const now = Date.now();
  const groups = new Map<string, WordReview[]>();
  for (const item of legacy) {
    const key = normalizeWordTerm(item.term);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const merged: WordReview[] = [];
  for (const [key, group] of groups) {
    const status = group.reduce<WordReviewStatus>((worst, item) => (RANK[item.status] < RANK[worst] ? item.status : worst), group[0].status);
    const latest = [...group].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const intervalDays = initialInterval(status);
    merged.push({
      id: wordReviewId(key),
      term: latest.term.trim(),
      status,
      intervalDays,
      dueAt: dueAtFor(status, now),
      streak: 0,
      lapses: status === 'unknown' ? 1 : 0,
      firstSeenAt: Math.min(...group.map(item => item.updatedAt)),
      lastReviewedAt: Math.max(...group.map(item => item.updatedAt)),
      courseId: latest.courseId,
      moduleId: latest.moduleId,
      wordId: latest.wordId,
      updatedAt: Math.max(...group.map(item => item.updatedAt))
    });
  }

  await db.transaction('rw', [db.wordReviews, db.settings], async () => {
    await db.wordReviews.bulkDelete(legacy.map(item => item.id));
    await db.wordReviews.bulkPut(merged);
    const current = await db.settings.get('app');
    if (current) await db.settings.put({ ...current, wordReviewsMigratedAt: now, updatedAt: now });
  });

  return merged.length;
}
