import { db } from '../db/db';
import type { LearningPlan, LevelKey, PlanUnit } from '../types/domain';
import type { PlanUnitResult } from '../services/aiClient';

export const LEVEL_LABELS: Record<LevelKey, string> = {
  junior: '初中',
  senior: '高中',
  cet4: '四级',
  cet6: '六级'
};

export const LEVEL_CEFR: Record<LevelKey, string> = {
  junior: 'A2',
  senior: 'B1',
  cet4: 'B2',
  cet6: 'C1'
};

export async function getLearningPlan(): Promise<LearningPlan | undefined> {
  const settings = await db.settings.get('app');
  return settings?.learningPlan;
}

async function savePlan(plan: LearningPlan): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  await db.settings.put({ ...settings, learningPlan: { ...plan, updatedAt: Date.now() }, updatedAt: Date.now() });
}

export async function createPlan(input: {
  startLevel: LevelKey;
  targetLevel: LevelKey;
  startNumber: number;
  units: PlanUnitResult[];
  keep?: PlanUnit[];
}): Promise<LearningPlan> {
  const units: PlanUnit[] = [
    ...(input.keep ?? []),
    ...input.units.map((unit, index) => ({
      number: input.startNumber + index,
      topic: unit.topic,
      grammar: unit.grammar,
      vocabulary: unit.vocabulary,
      goal: unit.goal,
      level: unit.level,
      status: 'pending' as const
    }))
  ];
  const plan: LearningPlan = {
    startLevel: input.startLevel,
    targetLevel: input.targetLevel,
    units,
    updatedAt: Date.now()
  };
  await savePlan(plan);
  return plan;
}

/** 追加一批后续课程；跳过已占用的课号。 */
export async function appendPlanUnits(plan: LearningPlan, startNumber: number, units: PlanUnitResult[]): Promise<LearningPlan> {
  const numbers = new Set(plan.units.map(unit => unit.number));
  let number = startNumber;
  const added: PlanUnit[] = [];
  for (const unit of units) {
    while (numbers.has(number)) number += 1;
    numbers.add(number);
    added.push({
      number,
      topic: unit.topic,
      grammar: unit.grammar,
      vocabulary: unit.vocabulary,
      goal: unit.goal,
      level: unit.level,
      status: 'pending'
    });
    number += 1;
  }
  const next: LearningPlan = { ...plan, units: [...plan.units, ...added], updatedAt: Date.now() };
  await savePlan(next);
  return next;
}

export async function nextPendingUnit(plan?: LearningPlan): Promise<PlanUnit | undefined> {
  const current = plan ?? await getLearningPlan();
  return current?.units.find(unit => unit.status === 'pending');
}

export async function markUnitDone(number: number, courseId: string): Promise<void> {
  const plan = await getLearningPlan();
  if (!plan) return;
  const next: LearningPlan = {
    ...plan,
    units: plan.units.map(unit => (unit.number === number ? { ...unit, status: 'done', courseId } : unit))
  };
  await savePlan(next);
}

export async function markUnitSkipped(number: number): Promise<void> {
  const plan = await getLearningPlan();
  if (!plan) return;
  await savePlan({
    ...plan,
    units: plan.units.map(unit => (unit.number === number ? { ...unit, status: 'skipped' } : unit))
  });
}

export async function updateUnitTopic(number: number, topic: string): Promise<void> {
  const plan = await getLearningPlan();
  if (!plan) return;
  const trimmed = topic.trim();
  if (!trimmed) return;
  await savePlan({
    ...plan,
    units: plan.units.map(unit => (unit.number === number ? { ...unit, topic: trimmed } : unit))
  });
}

/** 重新规划：保留已完成，删掉从 fromNumber 起未完成的课。 */
export async function dropPendingFrom(fromNumber: number): Promise<LearningPlan | undefined> {
  const plan = await getLearningPlan();
  if (!plan) return undefined;
  const next: LearningPlan = {
    ...plan,
    units: plan.units.filter(unit => unit.status === 'done' || unit.number < fromNumber)
  };
  await savePlan(next);
  return next;
}

export async function planProgress(plan?: LearningPlan): Promise<{ done: number; total: number; nextNumber?: number }> {
  const current = plan ?? await getLearningPlan();
  if (!current) return { done: 0, total: 0 };
  const planned = current.units.filter(unit => unit.status !== 'skipped');
  const done = planned.filter(unit => unit.status === 'done').length;
  const next = planned.find(unit => unit.status === 'pending');
  return { done, total: planned.length, nextNumber: next?.number };
}
