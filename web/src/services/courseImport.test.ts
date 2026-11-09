import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import type { GeneratedCoursePayload } from './coursePayload';
import { nextCourseNumber, saveGeneratedCourse } from './courseImport';

function payload(title: string): GeneratedCoursePayload {
  return {
    title,
    topic: '测试主题',
    goal: '验证生成课程能被正确保存',
    level: 'A2',
    words: [
      { id: 'w1', term: 'test', phonetic: '/test/', meanings: ['n. 测试'], example: 'A test.', exampleTranslation: '一次测试。' },
      { id: 'w2', term: 'check', phonetic: '/tʃek/', meanings: ['v. 检查'], example: 'Check it.', exampleTranslation: '检查一下。' },
      { id: 'w3', term: 'save', phonetic: '/seɪv/', meanings: ['v. 保存'], example: 'Save it.', exampleTranslation: '保存它。' }
    ],
    grammarSections: [{ title: '一般现在时', body: '表示习惯。' }],
    grammarQuestions: [
      {
        kind: 'choice',
        id: 'gq1',
        prompt: 'She ___ every day.',
        options: [{ id: 'gq1-o0', label: 'test' }, { id: 'gq1-o1', label: 'tests' }],
        answerId: 'gq1-o1',
        explanation: '第三人称单数。'
      },
      {
        kind: 'choice',
        id: 'gq2',
        prompt: 'They ___ here.',
        options: [{ id: 'gq2-o0', label: 'work' }, { id: 'gq2-o1', label: 'works' }],
        answerId: 'gq2-o0',
        explanation: '复数用原形。'
      }
    ],
    passage: 'This is a test passage for the generated course.',
    readingQuestions: [
      {
        kind: 'choice',
        id: 'rq1',
        prompt: 'What is this?',
        options: [{ id: 'rq1-o0', label: 'A test.' }, { id: 'rq1-o1', label: 'A book.' }],
        answerId: 'rq1-o0',
        explanation: '短文第一句。'
      }
    ],
    knowledgeLabels: ['一般现在时', '日常动词'],
    reviewQuestions: [
      {
        kind: 'choice',
        id: 'vq1',
        prompt: 'She ___ here.',
        options: [{ id: 'vq1-o0', label: 'work' }, { id: 'vq1-o1', label: 'works' }],
        answerId: 'vq1-o1',
        explanation: '第三人称单数。'
      }
    ]
  };
}

describe('generated course import', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('writes one course with four modules and its knowledge points', async () => {
    const number = await nextCourseNumber();
    expect(number).toBe(3);

    const result = await saveGeneratedCourse({ number, payload: payload('Generated One'), provider: 'mock' });
    expect(result.existing).toBe(false);
    expect(result.course.id).toBe('ai-3');
    expect(result.course.source).toBe('ai');
    expect(result.course.generatedBy).toBe('mock');

    const modules = await db.courseModules.where('courseId').equals('ai-3').sortBy('order');
    expect(modules.map(module => module.kind)).toEqual(['word', 'grammar', 'reading', 'review']);
    const knowledge = (await db.knowledge.toArray()).filter(point => point.id.startsWith('ai-3-'));
    expect(knowledge.map(point => point.id).sort()).toEqual(['ai-3-k1', 'ai-3-k2']);
    const review = modules.find(module => module.kind === 'review');
    expect(review && 'knowledgeIds' in review.content ? review.content.knowledgeIds : []).toEqual(['ai-3-k1', 'ai-3-k2']);
  });

  it('returns the stored course instead of creating a duplicate', async () => {
    const first = await saveGeneratedCourse({ number: 3, payload: payload('First'), provider: 'mock' });
    const second = await saveGeneratedCourse({ number: 3, payload: payload('Second'), provider: 'mock' });
    expect(second.existing).toBe(true);
    expect(second.course.title).toBe('First');
    expect(first.course.title).toBe('First');
    expect(await db.courses.count()).toBe(3);
    expect(await db.courseModules.count()).toBe(12);
  });
});
