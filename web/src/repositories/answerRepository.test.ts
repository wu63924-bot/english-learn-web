import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import type { ChoiceQuestion } from '../types/domain';
import { answerRecordId, getModuleAnswers, saveGradedAnswer } from './answerRepository';

const question: ChoiceQuestion = {
  kind: 'choice',
  id: 'q1',
  prompt: 'She ___ to work.',
  options: [
    { id: 'a', label: 'go' },
    { id: 'b', label: 'goes' }
  ],
  answerId: 'b',
  explanation: '第三人称单数。'
};

describe('answer repository', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('overwrites the same question instead of duplicating', async () => {
    const first = await saveGradedAnswer({ courseId: 'sample-1', moduleId: 'sample-1-grammar', question, value: 'a', status: 'incorrect' });
    const second = await saveGradedAnswer({ courseId: 'sample-1', moduleId: 'sample-1-grammar', question, value: 'b', status: 'correct' });
    expect(first.answer.id).toBe(second.answer.id);
    expect(first.answer.id).toBe(answerRecordId('sample-1', 'sample-1-grammar', 'q1'));
    expect(await db.answers.count()).toBe(1);
    expect(await db.grades.count()).toBe(1);
    expect((await db.answers.get(second.answer.id))?.value).toBe('b');
    expect((await db.grades.get(second.grade.id))?.status).toBe('correct');
  });

  it('restores answers and grades for a module only', async () => {
    await saveGradedAnswer({ courseId: 'sample-1', moduleId: 'sample-1-grammar', question, value: 'b', status: 'correct' });
    await saveGradedAnswer({ courseId: 'sample-2', moduleId: 'sample-2-grammar', question, value: 'a', status: 'incorrect' });

    const stored = await getModuleAnswers('sample-1', 'sample-1-grammar');
    expect(stored.answers).toHaveLength(1);
    expect(stored.answers[0].value).toBe('b');
    expect(stored.grades.get(stored.answers[0].id)?.status).toBe('correct');

    expect((await getModuleAnswers('sample-1', 'sample-1-reading')).answers).toHaveLength(0);
  });
});
