import { describe, expect, it } from 'vitest';
import { normalizeCourse } from './schema.ts';

const choice = (prompt: string) => ({
  kind: 'choice',
  prompt,
  options: ['a', 'b', 'c', 'd'],
  answerIndex: 0,
  explanation: 'E',
  knowledge: 0
});

const raw = {
  title: 'Test',
  topic: 'Test topic',
  goal: 'Test goal',
  level: 'A2',
  words: [
    { term: 'one', phonetic: '/wʌn/', meanings: ['num. 一'], example: 'One book.', exampleTranslation: '一本书。' },
    { term: 'two', phonetic: '/tuː/', meanings: ['num. 二'], example: 'Two books.', exampleTranslation: '两本书。' },
    { term: 'three', phonetic: '/θriː/', meanings: ['num. 三'], example: 'Three books.', exampleTranslation: '三本书。' }
  ],
  phrases: [
    { phrase: 'enjoy reading', meaning: '喜欢阅读' },
    { phrase: 'be good at', meaning: '擅长' }
  ],
  grammarSections: [
    {
      title: 'Test',
      body: 'Test body.',
      examples: [{ en: 'I enjoy reading.', zh: '我喜欢阅读。' }]
    }
  ],
  grammarQuestions: [choice('G1'), choice('G2'), choice('G3'), choice('G4'), choice('G5')],
  passage: 'A test passage with extra words.',
  passageTranslation: '测试短文。',
  passageGlossary: [{ term: 'extra', phonetic: '/ˈekstrə/', meaning: '额外的' }],
  readingQuestions: [choice('R1'), choice('R2'), choice('R3'), choice('R4'), choice('R5')],
  knowledgeLabels: ['Test point'],
  reviewQuestions: [
    { kind: 'translate', variant: 'correct', prompt: '改正：He enjoy to read.', reference: 'He enjoys reading.', explanation: 'enjoy 接 doing', knowledge: 0 },
    { kind: 'translate', variant: 'correct', prompt: '改正：She want go.', reference: 'She wants to go.', explanation: '第三人称单数', knowledge: 0 },
    { kind: 'translate', variant: 'correct', prompt: '改正：I am good at speak.', reference: 'I am good at speaking.', explanation: '介词后接 doing', knowledge: 0 },
    { kind: 'translate', prompt: '把这句话译成中文：I enjoy reading.', reference: '我喜欢阅读。', knowledge: 0 },
    { kind: 'translate', prompt: '把这句话译成中文：She wants to go.', reference: '她想去。', knowledge: 0 },
    { kind: 'translate', prompt: '把这句话译成英文：我喜欢阅读。', reference: 'I enjoy reading.', knowledge: 0 },
    { kind: 'translate', prompt: '把这句话译成英文：她想学习。', reference: 'She wants to study.', knowledge: 0 },
    { kind: 'translate', prompt: '把这句话译成英文：他擅长游泳。', reference: 'He is good at swimming.', knowledge: 0 },
    { kind: 'translate', prompt: '把这句话译成英文：我每天练习。', reference: 'I practise every day.', knowledge: 0 },
    { kind: 'translate', prompt: '把这句话译成英文：她完成了作业。', reference: 'She finished her homework.', knowledge: 0 }
  ]
};

describe('course schema', () => {
  it('keeps phrases, grammar examples and question variants', () => {
    const course = normalizeCourse(raw, 'test');
    expect(course.phrases).toEqual([
      { phrase: 'enjoy reading', meaning: '喜欢阅读' },
      { phrase: 'be good at', meaning: '擅长' }
    ]);
    expect(course.grammarSections[0].examples).toEqual([{ en: 'I enjoy reading.', zh: '我喜欢阅读。' }]);
    expect(course.reviewQuestions.filter(question => question.kind === 'translate' && question.variant === 'correct')).toHaveLength(3);
  });

  it('keeps a reading glossary and fills missing phonetics', () => {
    const course = normalizeCourse(raw, 'test');
    expect(course.passageGlossary).toEqual([
      { term: 'extra', phonetic: '/ˈekstrə/', meaning: '额外的' }
    ]);
  });

  it('accepts a course without a glossary for older providers', () => {
    const course = normalizeCourse({ ...raw, passageGlossary: undefined }, 'test');
    expect(course.passageGlossary).toBeUndefined();
  });

  it('rejects the wrong number of questions', () => {
    expect(() => normalizeCourse({ ...raw, grammarQuestions: raw.grammarQuestions.slice(0, 4) }, 'test')).toThrow();
    expect(() => normalizeCourse({ ...raw, readingQuestions: raw.readingQuestions.slice(0, 4) }, 'test')).toThrow();
    expect(() => normalizeCourse({ ...raw, reviewQuestions: raw.reviewQuestions.slice(0, 9) }, 'test')).toThrow();
  });

  it('rejects review sets without exactly three correction tasks', () => {
    const withoutCorrection = raw.reviewQuestions.map(question => {
      if (question.kind !== 'translate') return question;
      const { variant, ...rest } = question;
      void variant;
      return rest;
    });
    expect(() => normalizeCourse({ ...raw, reviewQuestions: withoutCorrection }, 'test')).toThrow();
  });
});
