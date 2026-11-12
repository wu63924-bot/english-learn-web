import { coursePreset } from '../data/coursePlan';
import { appendPlanUnits, getLearningPlan, LEVEL_CEFR, nextPendingUnit } from '../repositories/planRepository';
import type { LearningPlan, LevelKey } from '../types/domain';
import { generatePlan } from './aiClient';
import { nextCourseNumber } from './courseImport';

/** 下一批规划的起始课号：接在已有规划（或已生成课程）的最大编号之后。 */
export async function nextPlanStartNumber(): Promise<number> {
  const [plan, courseNumber] = await Promise.all([getLearningPlan(), nextCourseNumber()]);
  const planMax = plan?.units.length ? Math.max(...plan.units.map(unit => unit.number)) + 1 : 1;
  return Math.max(courseNumber, planMax);
}

/** 路线里没有待学课的时候，自动续一批 10 课；失败就交给预设兜底。 */
export async function ensurePlanBatch(): Promise<LearningPlan | undefined> {
  const plan = await getLearningPlan();
  if (!plan) return undefined;
  if (plan.units.some(unit => unit.status === 'pending')) return plan;
  try {
    const startNumber = await nextPlanStartNumber();
    const units = await generatePlan({
      startNumber,
      startLevel: plan.startLevel,
      targetLevel: plan.targetLevel,
      learned: plan.units.filter(unit => unit.status === 'done').map(unit => unit.topic)
    });
    return await appendPlanUnits(plan, startNumber, units);
  } catch {
    return plan;
  }
}

export interface NextCourseInput {
  number: number;
  topic: string;
  level: string;
  goal?: string;
  /** 对应学习路线里的课号，生成成功后标记完成 */
  planUnitNumber?: number;
}

/**
 * 下一课主题：有学习路线就用路线里的下一课，否则回落到内置预设。
 */
export async function nextCourseInput(): Promise<NextCourseInput> {
  const plan = await getLearningPlan();
  const unit = await nextPendingUnit(plan);
  if (plan && unit) {
    return {
      number: unit.number,
      topic: unit.topic,
      level: unit.level ?? LEVEL_CEFR[plan.targetLevel as LevelKey],
      goal: unit.goal,
      planUnitNumber: unit.number
    };
  }
  const number = await nextCourseNumber();
  const preset = coursePreset(number);
  return { number, topic: preset.topic, level: preset.level, goal: preset.goal };
}
