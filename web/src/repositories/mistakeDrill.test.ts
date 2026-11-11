import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import type { CourseModule, Mistake } from '../types/domain';
import { DRILL_MASTER_STREAK, drillSummary, getOrCreateDrillPlan, listDrillItems, listMistakes, recordDrillResult } from './mistakeRepository';

function mistakeOf(moduleId: string, questionId: string, courseId = 'sample-1'): Mistake {
  return {
    id: `${courseId}:${moduleId}:${questionId}`,
    courseId,
    moduleId,
    questionId,
    wrongValue: 'wrong',
    reason: '测试',
    createdAt: 1,
    updatedAt: 1
  };
}

async function seedMistakes(): Promise<Mistake[]> {
  const grammar = await db.courseModules.get('sample-1-grammar') as CourseModule<'grammar'> | undefined;
  const reading = await db.courseModules.get('sample-1-reading') as CourseModule<'reading'> | undefined;
  if (!grammar || !reading) throw new Error('sample modules missing');
  const items = [
    mistakeOf(grammar.id, grammar.content.questions[0].id),
    mistakeOf(grammar.id, grammar.content.questions[1].id),
    mistakeOf(reading.id, reading.content.questions.find(question => question.kind === 'translate')!.id)
  ];
  await db.mistakes.bulkPut(items);
  return items;
}

describe('mistake drill', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('builds a plan from objective mistakes only', async () => {
    const [first, second] = await seedMistakes();
    const plan = await getOrCreateDrillPlan();
    expect(plan.mistakeIds.sort()).toEqual([first.id, second.id].sort());
    const items = await listDrillItems();
    expect(items).toHaveLength(2);
    expect(items.every(item => item.question.kind === 'choice' || item.question.kind === 'fill')).toBe(true);
  });

  it('reuses the same plan within a day and records answers', async () => {
    const [first] = await seedMistakes();
    const plan = await getOrCreateDrillPlan();
    await recordDrillResult(first.id, true);

    const again = await getOrCreateDrillPlan();
    expect(again.mistakeIds).toEqual(plan.mistakeIds);
    expect(again.answeredIds).toContain(first.id);
    expect(await drillSummary()).toEqual({ total: plan.mistakeIds.length, done: 1 });
  });

  it('drops a mistake after two correct answers', async () => {
    const [first] = await seedMistakes();
    await getOrCreateDrillPlan();
    await recordDrillResult(first.id, true);
    const once = await db.mistakes.get(first.id);
    expect(once?.drillCorrectStreak).toBe(1);
    await recordDrillResult(first.id, true);
    const twice = await db.mistakes.get(first.id);
    expect(twice?.drillCorrectStreak).toBe(DRILL_MASTER_STREAK);
    expect(twice?.drillMasteredAt).toBeGreaterThan(0);

    await db.settings.update('app', { drillPlan: undefined });
    const next = await getOrCreateDrillPlan();
    expect(next.mistakeIds).not.toContain(first.id);
  });

  it('keeps reading mistakes out of records and drills', async () => {
    const reading = await db.courseModules.get('sample-1-reading') as CourseModule<'reading'> | undefined;
    if (!reading) throw new Error('sample reading missing');
    const choice = reading.content.questions.find(question => question.kind === 'choice');
    const grammar = await db.courseModules.get('sample-1-grammar') as CourseModule<'grammar'> | undefined;
    if (!choice || !grammar) throw new Error('sample questions missing');

    await db.mistakes.bulkPut([
      mistakeOf(grammar.id, grammar.content.questions[0].id),
      mistakeOf(reading.id, choice.id)
    ]);

    expect((await listMistakes()).map(view => view.moduleKind)).toEqual(['grammar']);
    expect((await getOrCreateDrillPlan()).mistakeIds).toEqual([`sample-1:${grammar.id}:${grammar.content.questions[0].id}`]);
  });

  it('resets the streak when answered wrong again', async () => {
    const [first] = await seedMistakes();
    await recordDrillResult(first.id, true);
    await recordDrillResult(first.id, false);
    const item = await db.mistakes.get(first.id);
    expect(item?.drillCorrectStreak).toBe(0);
    expect(item?.drillWrongCount).toBe(1);
    expect(item?.drillMasteredAt).toBeUndefined();
  });
});
