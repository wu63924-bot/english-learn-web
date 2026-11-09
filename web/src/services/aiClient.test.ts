import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import { AiError, generateCourse, gradeAnswer, hash } from './aiClient';

const coursePayload = {
  title: 'Generated Lesson',
  topic: 'tests',
  goal: 'verify the client',
  words: [
    { id: 'w1', term: 'a', meanings: ['n. a'], example: 'A.', exampleTranslation: '甲。' },
    { id: 'w2', term: 'b', meanings: ['n. b'], example: 'B.', exampleTranslation: '乙。' },
    { id: 'w3', term: 'c', meanings: ['n. c'], example: 'C.', exampleTranslation: '丙。' }
  ],
  grammarSections: [{ title: 't', body: 'b' }],
  grammarQuestions: [
    { kind: 'choice', id: 'gq1', prompt: 'p', options: [{ id: 'gq1-o0', label: 'x' }, { id: 'gq1-o1', label: 'y' }], answerId: 'gq1-o1', explanation: 'e' },
    { kind: 'choice', id: 'gq2', prompt: 'p2', options: [{ id: 'gq2-o0', label: 'x' }, { id: 'gq2-o1', label: 'y' }], answerId: 'gq2-o1', explanation: 'e' }
  ],
  passage: 'passage',
  readingQuestions: [
    { kind: 'choice', id: 'rq1', prompt: 'p', options: [{ id: 'rq1-o0', label: 'x' }, { id: 'rq1-o1', label: 'y' }], answerId: 'rq1-o1', explanation: 'e' }
  ],
  knowledgeLabels: ['k1'],
  reviewQuestions: [
    { kind: 'choice', id: 'vq1', prompt: 'p', options: [{ id: 'vq1-o0', label: 'x' }, { id: 'vq1-o1', label: 'y' }], answerId: 'vq1-o1', explanation: 'e' }
  ]
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('AI client', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('collapses concurrent duplicate requests into one call', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      await new Promise(resolve => setTimeout(resolve, 10));
      return jsonResponse({ data: coursePayload, usage: { inputTokens: 5, outputTokens: 7 }, meta: { provider: 'mock', cached: false } });
    }) as typeof fetch;

    const [first, second] = await Promise.all([
      generateCourse({ number: 21, topic: 'dedupe' }, { fetchImpl }),
      generateCourse({ number: 21, topic: 'dedupe' }, { fetchImpl })
    ]);
    expect(calls).toBe(1);
    expect(first.course.title).toBe('Generated Lesson');
    expect(second.course.title).toBe('Generated Lesson');
    expect(first.provider).toBe('mock');
    expect(await db.aiUsage.count()).toBe(1);
    expect((await db.aiUsage.toArray())[0].tokensIn).toBe(5);
  });

  it('maps a budget error and records no usage', async () => {
    const fetchImpl = (async () => jsonResponse({ error: { code: 'BUDGET_EXCEEDED', message: '今日 AI 调用次数已达上限' } }, 402)) as typeof fetch;
    await expect(generateCourse({ number: 22, topic: 'budget' }, { fetchImpl }))
      .rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
    expect(await db.aiUsage.count()).toBe(0);
  });

  it('rejects a structurally broken course payload', async () => {
    const fetchImpl = (async () => jsonResponse({
      data: { title: 'only a title' },
      usage: { inputTokens: 0, outputTokens: 0 },
      meta: { provider: 'mock', cached: false }
    })) as typeof fetch;
    await expect(generateCourse({ number: 23, topic: 'broken' }, { fetchImpl }))
      .rejects.toBeInstanceOf(AiError);
    await expect(generateCourse({ number: 23, topic: 'broken' }, { fetchImpl }))
      .rejects.toMatchObject({ code: 'BAD_PAYLOAD' });
  });

  it('grades an open answer and records grade usage', async () => {
    const fetchImpl = (async () => jsonResponse({
      data: { status: 'partial', feedback: '漏了时间状语' },
      usage: { inputTokens: 9, outputTokens: 4 },
      meta: { provider: 'mock', cached: false }
    })) as typeof fetch;

    const result = await gradeAnswer({
      courseId: 'sample-1',
      moduleId: 'sample-1-reading',
      questionId: 'sample-1-r2',
      prompt: '译成中文',
      reference: '她骑车通勤要二十分钟。',
      answer: '她通勤二十分钟。'
    }, { fetchImpl });
    expect(result).toEqual({ status: 'partial', feedback: '漏了时间状语' });
    const usage = await db.aiUsage.toArray();
    expect(usage).toHaveLength(1);
    expect(usage[0].kind).toBe('grade');
  });

  it('hashes the same text to the same key', () => {
    expect(hash('abc')).toBe(hash('abc'));
    expect(hash('abc')).not.toBe(hash('abd'));
  });
});
