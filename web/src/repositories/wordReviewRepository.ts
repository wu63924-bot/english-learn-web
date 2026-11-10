import { db } from '../db/db';
import type { CourseModule, WordItem, WordReview, WordReviewStatus } from '../types/domain';
import { applyWordRating } from '../services/wordReviewRules';
import { normalizeWordTerm, wordReviewId } from '../utils/wordTerm';

export { wordReviewId } from '../utils/wordTerm';

const RANK: Record<WordReviewStatus, number> = { unknown: 0, fuzzy: 1, known: 2 };

export interface WordRatingInput {
  term: string;
  status: WordReviewStatus;
  courseId?: string;
  moduleId?: string;
  wordId?: string;
  phonetic?: string;
  meanings?: string[];
  example?: string;
  exampleTranslation?: string;
  now?: Date;
}

function mergeMeanings(current: string[] | undefined, next: string[] | undefined): string[] | undefined {
  if (!next?.length) return current;
  if (!current?.length) return [...next];
  return [...new Set([...current, ...next])];
}

/** 写入一次评级；同一个词在任何课程里评级都会更新同一条记录。 */
export async function saveWordRating(input: WordRatingInput): Promise<WordReview> {
  const now = input.now ?? new Date();
  const id = wordReviewId(input.term);
  const existing = await db.wordReviews.get(id);
  const base: WordReview = existing ?? {
    id,
    term: input.term.trim(),
    status: input.status,
    intervalDays: 0,
    dueAt: now.getTime(),
    streak: 0,
    lapses: 0,
    firstSeenAt: now.getTime(),
    lastReviewedAt: 0,
    updatedAt: now.getTime()
  };
  const merged: WordReview = {
    ...base,
    term: input.term.trim() || base.term,
    phonetic: input.phonetic ?? base.phonetic,
    meanings: mergeMeanings(base.meanings, input.meanings),
    example: input.example ?? base.example,
    exampleTranslation: input.exampleTranslation ?? base.exampleTranslation,
    courseId: input.courseId ?? base.courseId,
    moduleId: input.moduleId ?? base.moduleId,
    wordId: input.wordId ?? base.wordId,
    firstSeenAt: existing ? base.firstSeenAt : now.getTime()
  };
  const next = applyWordRating({ review: merged, status: input.status, now });
  await db.wordReviews.put(next);
  return next;
}

/** 读取模块内每个词的当前评级，键是课程里的 wordId。 */
export async function wordStatusesForModule(
  words: Pick<WordItem, 'id' | 'term'>[]
): Promise<Record<string, WordReviewStatus>> {
  const ids = words.map(word => wordReviewId(word.term));
  const records = await db.wordReviews.bulkGet(ids);
  const byId = new Map<string, WordReviewStatus>();
  records.forEach(record => {
    if (record) byId.set(record.id, record.status);
  });
  const result: Record<string, WordReviewStatus> = {};
  for (const word of words) {
    const status = byId.get(wordReviewId(word.term));
    if (status) result[word.id] = status;
  }
  return result;
}

/** 到期单词：不认识的排前面，其余按到期时间。 */
export async function listDueWordReviews(now: Date = new Date()): Promise<WordReview[]> {
  const items = await db.wordReviews.where('dueAt').belowOrEqual(now.getTime()).toArray();
  return items.sort((a, b) => RANK[a.status] - RANK[b.status] || a.dueAt - b.dueAt);
}

export interface NewWordCandidate {
  term: string;
  phonetic?: string;
  meanings: string[];
  example: string;
  exampleTranslation: string;
  courseId: string;
  moduleId: string;
  wordId: string;
}

/** 课程词表里还没评过级的词，按课程顺序取前 limit 个。 */
export async function listNewWordCandidates(limit: number): Promise<NewWordCandidate[]> {
  if (limit <= 0) return [];
  const [courses, modules, seen] = await Promise.all([
    db.courses.toArray(),
    db.courseModules.toArray(),
    db.wordReviews.toArray()
  ]);
  const seenIds = new Set(seen.map(item => item.id));
  const courseOrder = new Map(courses.map(course => [course.id, course.number]));
  const wordModules = modules
    .filter((module): module is CourseModule<'word'> => module.kind === 'word')
    .sort((a, b) => (courseOrder.get(a.courseId) ?? 0) - (courseOrder.get(b.courseId) ?? 0) || a.order - b.order);
  const picked = new Map<string, NewWordCandidate>();
  for (const module of wordModules) {
    for (const word of module.content.words) {
      const key = normalizeWordTerm(word.term);
      if (!key || seenIds.has(`w:${key}`) || picked.has(key)) continue;
      picked.set(key, {
        term: word.term,
        phonetic: word.phonetic,
        meanings: word.meanings,
        example: word.example,
        exampleTranslation: word.exampleTranslation,
        courseId: module.courseId,
        moduleId: module.id,
        wordId: word.id
      });
      if (picked.size >= limit) return [...picked.values()];
    }
  }
  return [...picked.values()];
}

export async function countNewWordsToday(now: Date = new Date()): Promise<number> {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return db.wordReviews.where('firstSeenAt').between(start, end, true, false).count();
}

/** 已评过级但还没记住的词，供复习页说明本轮内容。 */
export async function countWordReviews(): Promise<{ due: number; learning: number; known: number }> {
  const items = await db.wordReviews.toArray();
  const now = Date.now();
  let due = 0;
  let learning = 0;
  let known = 0;
  for (const item of items) {
    if (item.dueAt <= now) due += 1;
    if (item.status === 'known') known += 1;
    else learning += 1;
  }
  return { due, learning, known };
}
