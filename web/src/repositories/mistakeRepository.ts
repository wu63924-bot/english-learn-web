import { db } from '../db/db';
import type { ChoiceQuestion, FillQuestion, Mistake, ModuleKind, Question } from '../types/domain';
import { todayKey } from '../utils/date';

export const DRILL_LIMIT = 10;
export const DRILL_MASTER_STREAK = 2;

export interface DrillItem {
  mistake: Mistake;
  question: ChoiceQuestion | FillQuestion;
  courseNumber: number;
  moduleKind: ModuleKind;
}

export interface DrillPlan {
  dateKey: string;
  mistakeIds: string[];
  answeredIds: string[];
}

export interface MistakeView {
  mistake: Mistake;
  courseNumber: number;
  courseTitle: string;
  moduleKind: ModuleKind;
  prompt: string;
  yourAnswer: string;
  correctAnswer: string;
  explanation: string;
}

async function questionOf(mistake: Mistake): Promise<Question | undefined> {
  const module = await db.courseModules.get(mistake.moduleId);
  if (!module) return undefined;
  const questions = 'questions' in module.content ? module.content.questions as Question[] : [];
  return questions.find(item => item.id === mistake.questionId);
}

/** 当天还没建计划（或跨天）时，按错误次数与久未练习挑 10 道错题。 */
export async function getOrCreateDrillPlan(): Promise<DrillPlan> {
  const settings = await db.settings.get('app');
  const today = todayKey();
  const existing = settings?.drillPlan;
  if (existing && existing.dateKey === today) return existing;

  const mistakes = await db.mistakes.toArray();
  const candidates: Mistake[] = [];
  for (const mistake of mistakes) {
    if (mistake.drillMasteredAt) continue;
    const question = await questionOf(mistake);
    if (!question || (question.kind !== 'choice' && question.kind !== 'fill')) continue;
    candidates.push(mistake);
  }
  candidates.sort((a, b) =>
    (b.drillWrongCount ?? 0) - (a.drillWrongCount ?? 0)
    || (a.lastDrillDate ?? '').localeCompare(b.lastDrillDate ?? '')
    || b.updatedAt - a.updatedAt);

  const plan: DrillPlan = {
    dateKey: today,
    mistakeIds: candidates.slice(0, DRILL_LIMIT).map(item => item.id),
    answeredIds: []
  };
  if (settings) await db.settings.put({ ...settings, drillPlan: plan, updatedAt: Date.now() });
  return plan;
}

export async function listDrillItems(): Promise<DrillItem[]> {
  const plan = await getOrCreateDrillPlan();
  const items: DrillItem[] = [];
  for (const id of plan.mistakeIds) {
    const mistake = await db.mistakes.get(id);
    if (!mistake) continue;
    const question = await questionOf(mistake);
    if (!question || (question.kind !== 'choice' && question.kind !== 'fill')) continue;
    const course = await db.courses.get(mistake.courseId);
    const module = await db.courseModules.get(mistake.moduleId);
    if (!course || !module) continue;
    items.push({ mistake, question, courseNumber: course.number, moduleKind: module.kind });
  }
  return items;
}

export async function drillSummary(): Promise<{ total: number; done: number }> {
  const plan = await getOrCreateDrillPlan();
  const answered = new Set(plan.answeredIds);
  return { total: plan.mistakeIds.length, done: plan.mistakeIds.filter(id => answered.has(id)).length };
}

/** 记录一次错题练习结果；连续答对 2 次标记为已巩固，不再进入每日计划。 */
export async function recordDrillResult(mistakeId: string, correct: boolean): Promise<void> {
  const today = todayKey();
  const now = Date.now();
  await db.transaction('rw', [db.mistakes, db.settings], async () => {
    const mistake = await db.mistakes.get(mistakeId);
    if (!mistake) return;
    const streak = correct ? (mistake.drillCorrectStreak ?? 0) + 1 : 0;
    await db.mistakes.put({
      ...mistake,
      drillCorrectStreak: streak,
      drillWrongCount: correct ? (mistake.drillWrongCount ?? 0) : (mistake.drillWrongCount ?? 0) + 1,
      lastDrillDate: today,
      ...(streak >= DRILL_MASTER_STREAK ? { drillMasteredAt: now } : {}),
      updatedAt: now
    });
    const settings = await db.settings.get('app');
    if (!settings?.drillPlan || settings.drillPlan.dateKey !== today) return;
    const answeredIds = [...new Set([...settings.drillPlan.answeredIds, mistakeId])];
    await db.settings.put({
      ...settings,
      drillPlan: { ...settings.drillPlan, answeredIds },
      updatedAt: now
    });
  });
}

export async function listMistakes(): Promise<MistakeView[]> {
  const mistakes = (await db.mistakes.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
  const views: MistakeView[] = [];
  for (const mistake of mistakes) {
    const [course, module] = await Promise.all([
      db.courses.get(mistake.courseId),
      db.courseModules.get(mistake.moduleId)
    ]);
    if (!course || !module) continue;
    const questions = 'questions' in module.content ? module.content.questions as Question[] : [];
    const question = questions.find(item => item.id === mistake.questionId);
    if (!question) continue;
    views.push({
      mistake,
      courseNumber: course.number,
      courseTitle: course.title,
      moduleKind: module.kind,
      prompt: question.prompt,
      yourAnswer: formatAnswer(question, mistake.wrongValue),
      correctAnswer: correctAnswerOf(question),
      explanation: 'explanation' in question && question.explanation ? question.explanation : question.kind === 'translate' ? question.reference : ''
    });
  }
  return views;
}

function optionLabel(question: Question, id: string): string {
  if (question.kind !== 'choice') return id;
  return question.options.find(option => option.id === id)?.label ?? id;
}

function formatAnswer(question: Question, value: string): string {
  if (!value.trim()) return '（空）';
  if (question.kind === 'choice') return optionLabel(question, value);
  return value;
}

function correctAnswerOf(question: Question): string {
  if (question.kind === 'choice') return optionLabel(question, question.answerId);
  if (question.kind === 'fill') return question.answers.join(' / ');
  return question.reference;
}
