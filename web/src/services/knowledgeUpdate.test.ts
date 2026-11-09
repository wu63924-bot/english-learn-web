import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import type { ChoiceQuestion, KnowledgePoint } from '../types/domain';
import { recordKnowledgeAttempt } from './knowledgeUpdate';

const question: ChoiceQuestion = {
  kind: 'choice',
  id: 'q1',
  prompt: 'She ___ English.',
  options: [{ id: 'q1-o0', label: 'study' }, { id: 'q1-o1', label: 'studies' }],
  answerId: 'q1-o1',
  explanation: '第三人称单数。',
  knowledgeIds: ['ai-3-k1']
};

function point(): KnowledgePoint {
  return {
    id: 'ai-3-k1',
    label: '一般现在时第三人称单数',
    kind: 'grammar',
    stage: 3,
    status: 'learning',
    correctStreak: 0,
    wrongStreak: 0,
    source: 'ai',
    updatedAt: 0
  };
}

describe('knowledge updates from course answers', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
    await db.knowledge.put(point());
  });

  it('marks a point for review after two wrong answers', async () => {
    await recordKnowledgeAttempt(question, 'wrong', '2026-11-09');
    expect((await db.knowledge.get('ai-3-k1'))?.status).toBe('learning');
    await recordKnowledgeAttempt(question, 'wrong', '2026-11-10');
    const updated = await db.knowledge.get('ai-3-k1');
    expect(updated?.status).toBe('needs_review');
    expect(updated?.wrongStreak).toBe(2);
    expect(updated?.lastSeenDate).toBe('2026-11-10');
  });

  it('keeps a single correct answer from flipping the state', async () => {
    await db.knowledge.put({ ...point(), status: 'needs_review', wrongStreak: 2 });
    await recordKnowledgeAttempt(question, 'correct', '2026-11-09');
    expect((await db.knowledge.get('ai-3-k1'))?.status).toBe('needs_review');
    await recordKnowledgeAttempt(question, 'correct', '2026-11-10');
    expect((await db.knowledge.get('ai-3-k1'))?.status).toBe('learning');
  });

  it('ignores questions without a knowledge mapping', async () => {
    await recordKnowledgeAttempt({ ...question, knowledgeIds: [] }, 'wrong', '2026-11-09');
    expect((await db.knowledge.get('ai-3-k1'))?.wrongStreak).toBe(0);
  });
});
