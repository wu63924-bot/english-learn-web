import { describe, expect, it } from 'vitest';
import { normalizeCourse } from './schema.ts';

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
  grammarSections: [{ title: 'Test', body: 'Test body.' }],
  grammarQuestions: [
    { kind: 'choice', prompt: 'Q1', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'E1', knowledge: 0 },
    { kind: 'choice', prompt: 'Q2', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'E2', knowledge: 0 }
  ],
  passage: 'A test passage with extra words.',
  passageTranslation: '测试短文。',
  passageGlossary: [{ term: 'extra', phonetic: '/ˈekstrə/', meaning: '额外的' }],
  readingQuestions: [
    { kind: 'choice', prompt: 'Q3', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'E3', knowledge: 0 }
  ],
  knowledgeLabels: ['Test point'],
  reviewQuestions: [
    { kind: 'choice', prompt: 'Q4', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'E4', knowledge: 0 }
  ]
};

describe('course schema', () => {
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
});
