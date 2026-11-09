import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import type { ChoiceQuestion } from '../types/domain';
import { saveGradedAnswer } from './answerRepository';
import { listMistakes } from './mistakeRepository';
import { listCourseRecords } from './recordRepository';
import { startCourse } from './courseRepository';

const question: ChoiceQuestion = {
  kind: 'choice',
  id: 'sample-1-g1',
  prompt: 'She ___ to work by bike.',
  options: [
    { id: 'sample-1-g1-0', label: 'go' },
    { id: 'sample-1-g1-1', label: 'goes' }
  ],
  answerId: 'sample-1-g1-1',
  explanation: '第三人称单数用 goes。'
};

describe('mistakes and records', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('records a wrong answer and joins it with the question', async () => {
    await saveGradedAnswer({
      courseId: 'sample-1',
      moduleId: 'sample-1-grammar',
      question,
      value: 'sample-1-g1-0',
      status: 'incorrect'
    });
    const views = await listMistakes();
    expect(views).toHaveLength(1);
    expect(views[0].prompt).toBe('She ___ to work by bike.');
    expect(views[0].yourAnswer).toBe('go');
    expect(views[0].correctAnswer).toBe('goes');
    expect(views[0].explanation).toContain('goes');
  });

  it('clears the mistake when the same question is answered correctly later', async () => {
    await saveGradedAnswer({ courseId: 'sample-1', moduleId: 'sample-1-grammar', question, value: 'sample-1-g1-0', status: 'incorrect' });
    expect(await db.mistakes.count()).toBe(1);
    await saveGradedAnswer({ courseId: 'sample-1', moduleId: 'sample-1-grammar', question, value: 'sample-1-g1-1', status: 'correct' });
    expect(await db.mistakes.count()).toBe(0);
  });

  it('summarizes a started course with its objective score', async () => {
    await startCourse('sample-1');
    await saveGradedAnswer({ courseId: 'sample-1', moduleId: 'sample-1-grammar', question, value: 'sample-1-g1-1', status: 'correct' });
    const records = await listCourseRecords();
    expect(records).toHaveLength(1);
    expect(records[0].course.id).toBe('sample-1');
    expect(records[0].objectiveAnswered).toBe(1);
    expect(records[0].objectiveCorrect).toBe(1);
    expect(records[0].moduleTotal).toBe(4);
  });
});
