import { db } from '../db/db';
import type { Course, CourseModule, KnowledgePoint, Question } from '../types/domain';
import type { GeneratedCoursePayload } from './coursePayload';
import { knowledgeIdFor, normalizeKnowledgeLabel } from '../utils/knowledge';

/**
 * The next lesson number follows both generated courses and imported history.
 * After importing Day 1–20 the next lesson is 21 instead of restarting at 3.
 */
export async function nextCourseNumber(): Promise<number> {
  const [courses, historyDays] = await Promise.all([db.courses.toArray(), db.historyDays.toArray()]);
  const courseMax = courses.reduce((max, course) => Math.max(max, course.number), 0);
  const historyMax = historyDays.reduce((max, day) => Math.max(max, day.dayNumber), 0);
  return Math.max(courseMax, historyMax) + 1;
}

export interface SaveGeneratedInput {
  number: number;
  payload: GeneratedCoursePayload;
  provider: 'mock' | 'live';
}

/**
 * Writes a generated course with deterministic ids. If the same lesson number
 * already exists the stored course is returned untouched, so a repeated click
 * or a repeated request never creates a duplicate.
 */
export async function saveGeneratedCourse(input: SaveGeneratedInput): Promise<{ course: Course; existing: boolean }> {
  const id = `ai-${input.number}`;
  return db.transaction('rw', [db.courses, db.courseModules, db.knowledge], async () => {
    const existing = await db.courses.get(id);
    if (existing) return { course: existing, existing: true };

    const now = Date.now();
    const payload = input.payload;
    const course: Course = {
      id,
      number: input.number,
      title: payload.title,
      topic: payload.topic,
      goal: payload.goal,
      level: payload.level,
      source: 'ai',
      generatedBy: input.provider,
      status: 'not_started',
      createdAt: now,
      updatedAt: now
    };

    const existingPoints = await db.knowledge.toArray();
    const byLabel = new Map(existingPoints.map(point => [normalizeKnowledgeLabel(point.label), point]));
    const knowledge: KnowledgePoint[] = [];
    const knowledgeIds: string[] = [];
    for (const label of payload.knowledgeLabels) {
      const key = normalizeKnowledgeLabel(label);
      let point = byLabel.get(key);
      if (!point) {
        point = {
          id: knowledgeIdFor(label),
          label,
          kind: 'pattern',
          stage: input.number,
          status: 'learning',
          correctStreak: 0,
          wrongStreak: 0,
          updatedAt: now
        };
        byLabel.set(key, point);
        knowledge.push(point);
      }
      knowledgeIds.push(point.id);
    }

    const modules: CourseModule[] = [
      { id: `${id}-word`, courseId: id, kind: 'word', order: 1, status: 'todo', content: { words: payload.words, ...(payload.phrases?.length ? { phrases: payload.phrases } : {}) } },
      {
        id: `${id}-grammar`,
        courseId: id,
        kind: 'grammar',
        order: 2,
        status: 'todo',
        content: { sections: payload.grammarSections, questions: withKnowledge(payload.grammarQuestions, knowledgeIds) }
      },
      {
        id: `${id}-reading`,
        courseId: id,
        kind: 'reading',
        order: 3,
        status: 'todo',
        content: {
          passage: payload.passage,
          passageTranslation: payload.passageTranslation,
          glossary: payload.passageGlossary ?? [],
          questions: withKnowledge(payload.readingQuestions, knowledgeIds)
        }
      },
      {
        id: `${id}-review`,
        courseId: id,
        kind: 'review',
        order: 4,
        status: 'todo',
        content: { knowledgeIds: [...new Set(knowledgeIds)], questions: withKnowledge(payload.reviewQuestions, knowledgeIds) }
      }
    ];

    await db.courses.put(course);
    await db.courseModules.bulkPut(modules);
    await db.knowledge.bulkPut(knowledge);
    return { course, existing: false };
  });
}

/** Maps the AI's knowledge index to the canonical knowledge ids for this course. */
function withKnowledge<Q extends Question>(questions: Q[], knowledgeIds: string[]): Q[] {
  return questions.map(question => {
    const index = question.knowledgeIndex;
    const clone = { ...question };
    delete (clone as { knowledgeIndex?: number }).knowledgeIndex;
    if (index !== undefined && knowledgeIds[index]) clone.knowledgeIds = [knowledgeIds[index]];
    return clone;
  });
}
