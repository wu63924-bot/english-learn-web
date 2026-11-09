import { describe, expect, it } from 'vitest';
import type { ChoiceQuestion, Question, TranslateQuestion, WordItem } from '../types/domain';
import { sampleCourseBundles } from './sampleCourses';

function allQuestions(): Question[] {
  const questions: Question[] = [];
  for (const bundle of sampleCourseBundles) {
    for (const module of bundle.modules) {
      if ('questions' in module.content) questions.push(...module.content.questions);
    }
  }
  return questions;
}

function allWords(): WordItem[] {
  const words: WordItem[] = [];
  for (const bundle of sampleCourseBundles) {
    for (const module of bundle.modules) {
      if ('words' in module.content) words.push(...module.content.words);
    }
  }
  return words;
}

describe('sample course data', () => {
  it('has two courses with four ordered modules each', () => {
    expect(sampleCourseBundles).toHaveLength(2);
    for (const bundle of sampleCourseBundles) {
      expect(bundle.modules.map(module => module.order)).toEqual([1, 2, 3, 4]);
      expect(bundle.modules.map(module => module.kind)).toEqual(['word', 'grammar', 'reading', 'review']);
      expect(bundle.course.source).toBe('sample');
      expect(bundle.course.status).toBe('not_started');
    }
  });

  it('uses unique ids across courses', () => {
    const courseIds = sampleCourseBundles.map(bundle => bundle.course.id);
    const moduleIds = sampleCourseBundles.flatMap(bundle => bundle.modules.map(module => module.id));
    const knowledgeIds = sampleCourseBundles.flatMap(bundle => bundle.knowledge.map(point => point.id));
    expect(new Set(courseIds).size).toBe(courseIds.length);
    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    expect(new Set(knowledgeIds).size).toBe(knowledgeIds.length);
  });

  it('keeps every choice answer inside its options', () => {
    const questions = allQuestions().filter((question): question is ChoiceQuestion => question.kind === 'choice');
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      expect(question.options.some(option => option.id === question.answerId)).toBe(true);
      expect(question.options).toHaveLength(4);
      expect(question.explanation.trim()).not.toBe('');
      expect(new Set(question.options.map(option => option.id)).size).toBe(question.options.length);
    }
  });

  it('gives every open question a reference answer', () => {
    const questions = allQuestions().filter((question): question is TranslateQuestion => question.kind === 'translate');
    expect(questions).toHaveLength(2);
    for (const question of questions) expect(question.reference.trim().length).toBeGreaterThan(0);
  });

  it('points review modules at knowledge defined in the same bundle', () => {
    for (const bundle of sampleCourseBundles) {
      const known = new Set(bundle.knowledge.map(point => point.id));
      const review = bundle.modules.find(module => module.kind === 'review');
      expect(review).toBeTruthy();
      if (review && 'knowledgeIds' in review.content) {
        expect(review.content.knowledgeIds.length).toBeGreaterThan(0);
        for (const id of review.content.knowledgeIds) expect(known.has(id)).toBe(true);
      }
    }
  });

  it('writes phonetics in slash notation', () => {
    const words = allWords();
    expect(words).toHaveLength(10);
    for (const word of words) {
      expect(word.phonetic?.startsWith('/')).toBe(true);
      expect(word.phonetic?.endsWith('/')).toBe(true);
      expect(word.meanings.length).toBeGreaterThan(0);
      expect(word.example.trim()).not.toBe('');
      expect(word.exampleTranslation.trim()).not.toBe('');
    }
  });

  it('maps every sample question to a knowledge point', () => {
    for (const bundle of sampleCourseBundles) {
      const known = new Set(bundle.knowledge.map(point => point.id));
      for (const module of bundle.modules) {
        if (!('questions' in module.content)) continue;
        for (const question of module.content.questions) {
          expect(question.knowledgeIds?.length).toBeGreaterThan(0);
          for (const id of question.knowledgeIds ?? []) expect(known.has(id)).toBe(true);
        }
      }
    }
  });
});
