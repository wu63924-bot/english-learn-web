import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import type { ChoiceQuestion } from '../types/domain';
import { answerRecordId, getLastAnsweredModuleId, getModuleAnswers, saveAnswer, saveGradedAnswer } from './answerRepository';

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

  it('stores a typed draft without grading it', async () => {
    const translate = { kind: 'translate' as const, id: 't1', prompt: '译成中文', reference: '参考译文' };
    await saveAnswer({ courseId: 'sample-1', moduleId: 'sample-1-reading', question: translate, value: '她骑车通勤要二十分钟。' });
    const stored = await getModuleAnswers('sample-1', 'sample-1-reading');
    expect(stored.answers).toHaveLength(1);
    expect(stored.answers[0].value).toBe('她骑车通勤要二十分钟。');
    expect(stored.answers[0].questionKind).toBe('translate');
    expect(stored.grades.size).toBe(0);
  });

  it('returns the module of the most recently saved answer', async () => {
    await db.answers.bulkPut([
      {
        id: 'a1', courseId: 'sample-1', moduleId: 'sample-1-word', questionId: 'q1',
        questionKind: 'choice', value: 'a', dateKey: '2026-11-09', updatedAt: 100
      },
      {
        id: 'a2', courseId: 'sample-1', moduleId: 'sample-1-reading', questionId: 'q2',
        questionKind: 'choice', value: 'b', dateKey: '2026-11-09', updatedAt: 200
      }
    ]);
    expect(await getLastAnsweredModuleId('sample-1')).toBe('sample-1-reading');
    expect(await getLastAnsweredModuleId('missing')).toBeUndefined();
  });
});
