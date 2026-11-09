import { db } from '../db/db';
import type { HistoryDay, KnowledgePoint } from '../types/domain';
import { todayKey } from '../utils/date';
import { nextCourseNumber } from './courseImport';

export interface HistoryImportDay {
  day: number;
  topic: string;
  choiceAnswers: string[];
  englishAttempts: string[];
  chineseAttempts: string[];
  lines: string[];
}

export interface HistoryImportFile {
  source: string;
  title?: string;
  url?: string;
  capturedAt?: string;
  days: HistoryImportDay[];
}

export const HISTORY_SOURCE = 'ChatGPT 分享';

export const HISTORY_WEAK_POINTS = [
  { id: 'history-k1', label: '一般现在时：第三人称单数', evidence: 'Day 12–13：He get up every morning at seven' },
  { id: 'history-k2', label: '一般过去时的构成', evidence: 'Day 12–13：I was study English yesterday；He stay the home at yesterday night' },
  { id: 'history-k3', label: 'there be 与 a/an', evidence: 'Day 18：There is a English book；There is a teacher an five students' },
  { id: 'history-k4', label: '比较级与最高级的搭配', evidence: 'Day 17：the tallest in the our class；the youngest in the three students' },
  { id: 'history-k5', label: '并列句连词与标点', evidence: 'Day 19：He studies English an reads books' }
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** Accepts the structured file exported from docs/history or the same shape hand-written. */
export function parseHistoryImport(text: string): HistoryImportFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (!isRecord(value)) throw new Error('历史材料格式不正确');
  if (typeof value.source !== 'string' || !value.source.trim()) throw new Error('缺少来源说明');
  if (!Array.isArray(value.days) || value.days.length === 0) throw new Error('没有任何学习日');
  if (value.days.length > 366) throw new Error('学习日数量异常');

  const seen = new Set<number>();
  const days: HistoryImportDay[] = value.days.map(item => {
    if (!isRecord(item)) throw new Error('学习日格式不正确');
    const day = item.day;
    if (typeof day !== 'number' || !Number.isSafeInteger(day) || day < 1 || day > 9999) throw new Error('学习日编号不正确');
    if (seen.has(day)) throw new Error(`学习日 ${day} 重复`);
    seen.add(day);
    return {
      day,
      topic: typeof item.topic === 'string' ? item.topic.trim() : '',
      choiceAnswers: stringArray(item.choiceAnswers),
      englishAttempts: stringArray(item.englishAttempts),
      chineseAttempts: stringArray(item.chineseAttempts),
      lines: stringArray(item.lines)
    };
  });

  return {
    source: value.source.trim(),
    title: typeof value.title === 'string' ? value.title : undefined,
    url: typeof value.url === 'string' ? value.url : undefined,
    capturedAt: typeof value.capturedAt === 'string' ? value.capturedAt : undefined,
    days: days.sort((a, b) => a.day - b.day)
  };
}

export interface HistoryPreview {
  source: string;
  title?: string;
  totalDays: number;
  studiedDays: number;
  listedOnlyDays: number;
  missingTopics: number;
  answerCount: number;
  weakPoints: { label: string; evidence: string }[];
  newKnowledge: number;
  existingKnowledge: number;
  nextCourseNumber: number;
}

export async function previewHistoryImport(file: HistoryImportFile): Promise<HistoryPreview> {
  const ids = knowledgeIdsOf(file);
  const existing = await db.knowledge.bulkGet(ids);
  return {
    source: file.source,
    title: file.title,
    totalDays: file.days.length,
    studiedDays: file.days.filter(day => answerCountOf(day) > 0).length,
    listedOnlyDays: file.days.filter(day => answerCountOf(day) === 0).length,
    missingTopics: file.days.filter(day => !day.topic).length,
    answerCount: file.days.reduce((total, day) => total + answerCountOf(day), 0),
    weakPoints: HISTORY_WEAK_POINTS.map(point => ({ label: point.label, evidence: point.evidence })),
    newKnowledge: ids.filter((_, index) => !existing[index]).length,
    existingKnowledge: ids.filter((_, index) => Boolean(existing[index])).length,
    nextCourseNumber: await nextCourseNumber()
  };
}

export interface HistoryApplyOptions {
  markWeakpointsForReview: boolean;
}

/**
 * Writes history days and knowledge points only. It never creates courses,
 * answers, grades or completion states, so no score or mastery is invented.
 */
export async function applyHistoryImport(file: HistoryImportFile, options: HistoryApplyOptions): Promise<void> {
  const now = Date.now();
  const days: HistoryDay[] = file.days.map(day => ({
    id: `history-day-${day.day}`,
    dayNumber: day.day,
    topic: day.topic,
    source: file.source,
    evidence: answerCountOf(day) > 0 ? 'studied' : 'listed_only',
    answerCount: answerCountOf(day),
    confirmed: false,
    createdAt: now
  }));

  const knowledge: KnowledgePoint[] = [];
  if (options.markWeakpointsForReview) {
    for (const point of HISTORY_WEAK_POINTS) {
      knowledge.push({
        id: point.id,
        label: point.label,
        kind: 'grammar',
        stage: 0,
        status: 'needs_review',
        correctStreak: 0,
        wrongStreak: 0,
        source: 'import',
        confirmed: true,
        updatedAt: now
      });
    }
  }
  for (const day of file.days) {
    if (!day.topic) continue;
    knowledge.push({
      id: `history-topic-${day.day}`,
      label: `Day ${day.day}：${day.topic}`,
      kind: 'grammar',
      stage: day.day,
      status: 'learning',
      correctStreak: 0,
      wrongStreak: 0,
      source: 'import',
      confirmed: true,
      updatedAt: now
    });
  }

  await db.transaction('rw', [db.historyDays, db.knowledge, db.settings], async () => {
    if (days.length) await db.historyDays.bulkPut(days);
    if (knowledge.length) await db.knowledge.bulkPut(knowledge);
    const settings = await db.settings.get('app');
    if (settings) await db.settings.put({ ...settings, historyImportedAt: now, updatedAt: now });
  });
}

export async function getHistorySummary(): Promise<{ days: number; studiedDays: number; importedAt?: number }> {
  const days = await db.historyDays.toArray();
  const settings = await db.settings.get('app');
  return {
    days: days.length,
    studiedDays: days.filter(day => day.evidence === 'studied').length,
    importedAt: settings?.historyImportedAt
  };
}

function answerCountOf(day: HistoryImportDay): number {
  return day.choiceAnswers.length + day.englishAttempts.length + day.chineseAttempts.length;
}

function knowledgeIdsOf(file: HistoryImportFile): string[] {
  return [
    ...HISTORY_WEAK_POINTS.map(point => point.id),
    ...file.days.filter(day => day.topic).map(day => `history-topic-${day.day}`)
  ];
}

export function historyFileName(): string {
  return `history-import-${todayKey()}.json`;
}
