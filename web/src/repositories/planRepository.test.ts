import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import type { PlanUnitResult } from '../services/aiClient';
import {
  appendPlanUnits,
  createPlan,
  dropPendingFrom,
  getLearningPlan,
  markUnitDone,
  markUnitDoneByCourse,
  markUnitGenerated,
  markUnitSkipped,
  nextPendingUnit,
  planProgress,
  planReplacement,
  reconcilePlanStatus,
  removePlanUnit,
  setPlanCurrent,
  updateUnitTopic
} from './planRepository';

function units(count = 10): PlanUnitResult[] {
  return Array.from({ length: count }, (_, index) => ({
    topic: `主题 ${index + 1}`,
    grammar: `语法 ${index + 1}`,
    vocabulary: `词汇 ${index + 1}`,
    goal: `目标 ${index + 1}`,
    level: 'B1'
  }));
}

describe('learning plan repository', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('creates ten numbered units from the start number', async () => {
    const plan = await createPlan({ startLevel: 'senior', targetLevel: 'cet4', startNumber: 32, units: units() });
    expect(plan.units.map(unit => unit.number)).toEqual([32, 33, 34, 35, 36, 37, 38, 39, 40, 41]);
    expect(plan.units.every(unit => unit.status === 'pending')).toBe(true);
    expect((await nextPendingUnit(plan))?.number).toBe(32);
  });

  it('marks done, skipped and edits the topic', async () => {
    await createPlan({ startLevel: 'senior', targetLevel: 'cet4', startNumber: 32, units: units() });
    await markUnitDone(32, 'ai-32');
    await markUnitSkipped(33);
    await updateUnitTopic(34, '换过的主题');

    const plan = await getLearningPlan();
    expect(plan?.units[0]).toMatchObject({ status: 'done', courseId: 'ai-32' });
    expect(plan?.units[1].status).toBe('skipped');
    expect(plan?.units[2].topic).toBe('换过的主题');
    expect(await nextPendingUnit()).toMatchObject({ number: 34 });
    expect(await planProgress()).toMatchObject({ done: 1, total: 9, nextNumber: 34 });
  });

  it('keeps finished units when replanning', async () => {
    await createPlan({ startLevel: 'senior', targetLevel: 'cet4', startNumber: 32, units: units() });
    await markUnitDone(32, 'ai-32');
    await dropPendingFrom(1);

    const plan = await getLearningPlan();
    expect(plan?.units).toHaveLength(1);
    expect(plan?.units[0].number).toBe(32);
  });

  it('keeps finished units when replanning with createPlan', async () => {
    await createPlan({ startLevel: 'senior', targetLevel: 'cet4', startNumber: 32, units: units() });
    await markUnitDone(32, 'ai-32');
    const kept = await dropPendingFrom(1);
    const next = await createPlan({
      startLevel: 'senior',
      targetLevel: 'cet6',
      startNumber: 33,
      units: units(2),
      keep: kept?.units ?? []
    });
    expect(next.units.map(unit => unit.number)).toEqual([32, 33, 34]);
    expect(next.units[0].status).toBe('done');
    expect(next.targetLevel).toBe('cet6');
  });

  it('appends after the highest planned number even with gaps', async () => {
    await createPlan({ startLevel: 'senior', targetLevel: 'cet4', startNumber: 9, units: units(10) });
    await removePlanUnit(12);
    const plan = await getLearningPlan();
    if (!plan) throw new Error('plan missing');
    const next = await appendPlanUnits(plan, 9, units(2));
    expect(next.units.slice(-2).map(unit => unit.number)).toEqual([19, 20]);
  });

  it('keeps a generated course out of the finished count until it is completed', async () => {
    await createPlan({ startLevel: 'senior', targetLevel: 'cet4', startNumber: 32, units: units() });
    await markUnitGenerated(32, 'ai-32');

    const plan = await getLearningPlan();
    expect(plan?.units[0]).toMatchObject({ status: 'generated', courseId: 'ai-32' });
    expect(await planProgress()).toMatchObject({ done: 0, total: 10, nextNumber: 33 });
    expect((await nextPendingUnit())?.number).toBe(33);

    await markUnitDoneByCourse('ai-32');
    expect((await getLearningPlan())?.units[0].status).toBe('done');
    expect(await planProgress()).toMatchObject({ done: 1, nextNumber: 33 });
  });

  it('demotes units that were marked done before the course finished', async () => {
    await createPlan({ startLevel: 'senior', targetLevel: 'cet4', startNumber: 32, units: units() });
    await markUnitDone(32, 'ai-32');
    await markUnitDone(33, 'ai-33');
    await db.courses.put({
      id: 'ai-33', number: 33, title: '第 33 课', topic: '主题 2', goal: '目标 2',
      source: 'ai', status: 'completed', createdAt: 0, updatedAt: 0
    });

    const reconciled = await reconcilePlanStatus();
    expect(reconciled?.units.find(unit => unit.number === 32)?.status).toBe('generated');
    expect(reconciled?.units.find(unit => unit.number === 33)?.status).toBe('done');
  });

  it('plans a replacement without touching the stored route first', async () => {
    await createPlan({ startLevel: 'senior', targetLevel: 'cet4', startNumber: 32, units: units(4) });
    await markUnitDone(32, 'ai-32');
    const before = await getLearningPlan();

    const replacement = planReplacement(before, 40);
    expect(replacement.keep.map(unit => unit.number)).toEqual([32]);
    expect(replacement.startNumber).toBe(40);
    // Nothing was written yet, so a failed model request keeps the old route.
    expect(await getLearningPlan()).toEqual(before);

    const created = await createPlan({
      startLevel: 'senior', targetLevel: 'cet6', startNumber: replacement.startNumber,
      units: units(2), keep: replacement.keep
    });
    expect(created.units.map(unit => unit.number)).toEqual([32, 40, 41]);
    expect(created.units[0].status).toBe('done');
  });

  it('pins a unit as next and removes units', async () => {
    await createPlan({ startLevel: 'senior', targetLevel: 'cet4', startNumber: 32, units: units() });
    expect(await setPlanCurrent(34)).toBe(true);
    expect((await nextPendingUnit())?.number).toBe(34);

    await removePlanUnit(34);
    const plan = await getLearningPlan();
    expect(plan?.units.some(unit => unit.number === 34)).toBe(false);
    expect(plan?.currentNumber).toBeUndefined();
    expect((await nextPendingUnit())?.number).toBe(32);
  });

  it('appends a batch without reusing taken numbers', async () => {
    const plan = await createPlan({ startLevel: 'senior', targetLevel: 'cet4', startNumber: 32, units: units() });
    const next = await appendPlanUnits(plan, 41, units(2));
    expect(next.units.slice(-2).map(unit => unit.number)).toEqual([42, 43]);
  });
});
