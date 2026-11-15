import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import { createPlan } from '../repositories/planRepository';
import { courseFocus, nextCourseInput } from './nextCourse';

describe('next course input', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('carries the planned grammar and vocabulary into generation', async () => {
    await createPlan({
      startLevel: 'senior', targetLevel: 'cet4', startNumber: 33,
      units: [{ topic: '条件句', grammar: '主将从现', vocabulary: '时间与条件', goal: '说清条件', level: 'B1' }]
    });
    const input = await nextCourseInput();
    expect(input).toMatchObject({ number: 33, topic: '条件句', grammar: '主将从现', vocabulary: '时间与条件' });

    const focus = courseFocus(input, ['一般现在时']);
    expect(focus).toContain('本课语法点：主将从现');
    expect(focus).toContain('词汇方向：时间与条件');
    expect(focus).toContain('需侧重：一般现在时');
  });

  it('falls back to the preset topic without a learning plan', async () => {
    const input = await nextCourseInput();
    expect(input.grammar).toBeUndefined();
    expect(courseFocus(input)).toBeUndefined();
  });

  it('keeps the focus hint within the server limit', () => {
    const long = courseFocus({ number: 1, topic: 't', level: 'B1', grammar: '语'.repeat(300) }, []);
    expect((long ?? '').length).toBeLessThanOrEqual(280);
  });
});
