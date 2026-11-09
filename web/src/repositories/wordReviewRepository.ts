import { db } from '../db/db';
import type { WordReview, WordReviewStatus } from '../types/domain';

export function wordReviewId(courseId: string, moduleId: string, wordId: string): string {
  return `${courseId}:${moduleId}:${wordId}`;
}

export async function listWordReviews(courseId: string, moduleId: string): Promise<WordReview[]> {
  return db.wordReviews.where('courseId').equals(courseId).filter(item => item.moduleId === moduleId).toArray();
}

export async function saveWordReview(input: {
  courseId: string;
  moduleId: string;
  wordId: string;
  term: string;
  status: WordReviewStatus;
}): Promise<void> {
  await db.wordReviews.put({
    id: wordReviewId(input.courseId, input.moduleId, input.wordId),
    ...input,
    updatedAt: Date.now()
  });
}

export async function listWeakWordReviews(): Promise<WordReview[]> {
  const items = await db.wordReviews.toArray();
  return items
    .filter(item => item.status !== 'known')
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
