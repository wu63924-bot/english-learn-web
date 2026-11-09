import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import type { ChoiceQuestion, KnowledgePoint } from '../types/domain';
import { unifyKnowledge } from './knowledgeMigration';

function point(id: string, status: KnowledgePoint['status'], updatedAt: number): KnowledgePoint {
  return {
    id,
    label: '一般现在时：第三人称单数',
    kind: 'grammar',
    stage: 1,
    status,
    correctStreak: status === 'mastered' ? 3 : 0,
    wrongStreak: status === 'needs_review' ? 2 : 0,
    updatedAt
  };
}

const question: ChoiceQuestion = {
  kind: 'choice',
  id: 'q1',
  prompt: 'She ___ English.',
  options: [{ id: 'o1', label: 'study' }, { id: 'o2', label: 'studies' }],
  answerId: 'o2',
  explanation: '三单。',
  knowledgeIds: ['ai-21-k1']
};

describe('knowledge migration', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
    await db.knowledge.clear();
  });

  it('merges duplicate labels and rewrites course, grade, review and mistake references', async () => {
    await db.knowledge.bulkPut([
      point('history-k1', 'needs_review', 1),
      point('ai-21-k1', 'learning', 2)
    ]);
    await db.courseModules.put({
      id: 'ai-21-grammar',
      courseId: 'ai-21',
      kind: 'grammar',
      order: 2,
      status: 'todo',
      content: { sections: [], questions: [question] }
    });
    await db.answers.put({
      id: 'ai-21:ai-21-grammar:q1',
      courseId: 'ai-21',
      moduleId: 'ai-21-grammar',
      questionId: 'q1',
      questionKind: 'choice',
      value: 'o2',
      dateKey: '2026-11-09',
      updatedAt: 1
    });
    await db.grades.put({
      id: 'grade:ai-21:ai-21-grammar:q1',
      answerId: 'ai-21:ai-21-grammar:q1',
      status: 'correct',
      source: 'local',
      gradedAt: 1,
      knowledgeIds: ['ai-21-k1']
    });
    await db.reviews.put({
      id: 'r1',
      knowledgeId: 'ai-21-k1',
      dueDate: '2026-11-09',
      reason: 'test',
      state: 'pending',
      createdAt: 1
    });
    await db.mistakes.put({
      id: 'm1',
      courseId: 'ai-21',
      moduleId: 'ai-21-grammar',
      questionId: 'q1',
      knowledgeId: 'ai-21-k1',
      wrongValue: 'o1',
      reason: 'test',
      createdAt: 1,
      updatedAt: 1
    });

    expect(await unifyKnowledge()).toBe(1);

    const points = await db.knowledge.toArray();
    expect(points).toHaveLength(1);
    const canonical = points[0];
    expect(canonical.status).toBe('needs_review');
    expect(canonical.wrongStreak).toBe(2);

    const module = await db.courseModules.get('ai-21-grammar');
    const questions = module && 'questions' in module.content ? module.content.questions : [];
    expect(questions[0]?.knowledgeIds).toEqual([canonical.id]);
    expect((await db.grades.get('grade:ai-21:ai-21-grammar:q1'))?.knowledgeIds).toEqual([canonical.id]);
    expect((await db.reviews.get('r1'))?.knowledgeId).toBe(canonical.id);
    expect((await db.mistakes.get('m1'))?.knowledgeId).toBe(canonical.id);
    expect((await db.settings.get('app'))?.knowledgeUnifiedAt).toBeTruthy();

    expect(await unifyKnowledge()).toBe(0);
  });
});
