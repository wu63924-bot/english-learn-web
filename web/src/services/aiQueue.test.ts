import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import type { KnowledgePoint } from '../types/domain';
import { gradeOrQueue, listPendingGrades, pendingGradeCount, processPendingGrades } from './aiQueue';

const input = {
  courseId: 'ai-9',
  moduleId: 'ai-9-reading',
  questionId: 'ai-9-rq2',
  prompt: '把这句话译成中文：Small steps matter.',
  reference: '小步积累很重要。',
  answer: '小步很重要。',
  knowledgeIds: ['ai-9-k1']
};

function point(): KnowledgePoint {
  return {
    id: 'ai-9-k1',
    label: '翻译要点',
    kind: 'pattern',
    stage: 9,
    status: 'learning',
    correctStreak: 0,
    wrongStreak: 0,
    source: 'ai',
    updatedAt: 0
  };
}

function envelope(status: string): Response {
  return {
    ok: true,
    json: async () => ({
      data: { status, feedback: '反馈' },
      usage: { inputTokens: 10, outputTokens: 5 },
      meta: { provider: 'mock', cached: false }
    })
  } as Response;
}

describe('offline AI grading queue', () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    await db.delete();
    await initializeDatabase();
    await db.knowledge.put(point());
  });

  it('queues a grade when the proxy is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await gradeOrQueue(input);
    expect(result.queued).toBe(true);
    expect(await pendingGradeCount()).toBe(1);
    const queued = await listPendingGrades();
    expect(queued[0]?.answer).toBe('小步很重要。');
  });

  it('grades queued answers once the proxy answers and updates knowledge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await gradeOrQueue(input);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope('correct')));
    expect(await processPendingGrades()).toBe(1);
    expect(await pendingGradeCount()).toBe(0);

    const stored = await db.answers.get('ai-9:ai-9-reading:ai-9-rq2');
    expect(stored?.value).toBe('小步很重要。');
    const grade = await db.grades.get('grade:ai-9:ai-9-reading:ai-9-rq2');
    expect(grade?.status).toBe('correct');
    expect((await db.knowledge.get('ai-9-k1'))?.correctStreak).toBe(1);
  });

  it('does not overwrite a newer answer with a stale queued grade', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await gradeOrQueue(input);

    await db.answers.put({
      id: 'ai-9:ai-9-reading:ai-9-rq2',
      courseId: 'ai-9',
      moduleId: 'ai-9-reading',
      questionId: 'ai-9-rq2',
      questionKind: 'translate',
      value: '修改后的新答案。',
      dateKey: '2026-11-09',
      updatedAt: Date.now()
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope('correct')));
    expect(await processPendingGrades()).toBe(0);
    expect((await db.answers.get('ai-9:ai-9-reading:ai-9-rq2'))?.value).toBe('修改后的新答案。');
    expect(await db.grades.count()).toBe(0);
    expect(await pendingGradeCount()).toBe(0);
  });

  it('marks a queued item failed when the proxy rejects the payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await gradeOrQueue(input);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'AI_BAD_RESPONSE', message: '内容不合法' } })
    } as Response));
    expect(await processPendingGrades()).toBe(0);
    const queued = await listPendingGrades();
    expect(queued[0]?.status).toBe('failed');
  });
});
