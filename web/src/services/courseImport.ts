import { db } from '../db/db';
import type { Course, CourseModule, KnowledgePoint, Question } from '../types/domain';
import type { GeneratedCoursePayload } from './coursePayload';

export async function nextCourseNumber(): Promise<number> {
  const courses = await db.courses.toArray();
  return courses.reduce((max, course) => Math.max(max, course.number), 0) + 1;
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

    const knowledge: KnowledgePoint[] = payload.knowledgeLabels.map((label, index) => ({
      id: `${id}-k${index + 1}`,
      label,
      kind: 'pattern',
      stage: input.number,
      status: 'learning',
      correctStreak: 0,
      wrongStreak: 0,
      updatedAt: now
    }));

    const modules: CourseModule[] = [
      { id: `${id}-word`, courseId: id, kind: 'word', order: 1, status: 'todo', content: { words: payload.words } },
      {
        id: `${id}-grammar`,
        courseId: id,
        kind: 'grammar',
        order: 2,
        status: 'todo',
        content: { sections: payload.grammarSections, questions: withKnowledge(payload.grammarQuestions, id) }
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
          questions: withKnowledge(payload.readingQuestions, id)
        }
      },
      {
        id: `${id}-review`,
        courseId: id,
        kind: 'review',
        order: 4,
        status: 'todo',
        content: { knowledgeIds: knowledge.map(point => point.id), questions: withKnowledge(payload.reviewQuestions, id) }
      }
    ];

    await db.courses.put(course);
    await db.courseModules.bulkPut(modules);
    await db.knowledge.bulkPut(knowledge);
    return { course, existing: false };
  });
}

/** Maps the AI's knowledge index to the knowledge ids created for this course. */
function withKnowledge<Q extends Question>(questions: Q[], courseId: string): Q[] {
  return questions.map(question => {
    const index = question.knowledgeIndex;
    const clone = { ...question };
    delete (clone as { knowledgeIndex?: number }).knowledgeIndex;
    if (index !== undefined) clone.knowledgeIds = [`${courseId}-k${index + 1}`];
    return clone;
  });
}
