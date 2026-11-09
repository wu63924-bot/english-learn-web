import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import { applyHistoryImport, HISTORY_WEAK_POINTS, parseHistoryImport, previewHistoryImport } from './historyImport';

const fixture = {
  source: 'ChatGPT 分享',
  title: '四级学习计划',
  days: [
    { day: 1, topic: '一般现在时、名词复数', choiceAnswers: ['babbcc'], englishAttempts: ['I like English'], chineseAttempts: ['她喜欢书'] },
    { day: 16, topic: '', choiceAnswers: [], englishAttempts: [], chineseAttempts: [] },
    { day: 18, topic: 'there be 句型', choiceAnswers: ['baccc', 'bcaba'], englishAttempts: ['There is a English book'], chineseAttempts: [] }
  ]
};

describe('history import', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('parses the structured file and rejects broken input', () => {
    const parsed = parseHistoryImport(JSON.stringify(fixture));
    expect(parsed.days.map(day => day.day)).toEqual([1, 16, 18]);
    expect(() => parseHistoryImport('{oops')).toThrow('文件不是有效的 JSON');
    expect(() => parseHistoryImport(JSON.stringify({ days: [] }))).toThrow('缺少来源说明');
    expect(() => parseHistoryImport(JSON.stringify({ source: 'x', days: [] }))).toThrow('没有任何学习日');
    expect(() => parseHistoryImport(JSON.stringify({
      source: 'x',
      days: [{ day: 1, topic: 'a' }, { day: 1, topic: 'b' }]
    }))).toThrow('学习日 1 重复');
  });

  it('previews counts without writing anything', async () => {
    const parsed = parseHistoryImport(JSON.stringify(fixture));
    const preview = await previewHistoryImport(parsed);
    expect(preview.totalDays).toBe(3);
    expect(preview.studiedDays).toBe(2);
    expect(preview.listedOnlyDays).toBe(1);
    expect(preview.answerCount).toBe(6);
    expect(preview.weakPoints).toHaveLength(HISTORY_WEAK_POINTS.length);
    expect(preview.nextCourseNumber).toBe(3);
    expect(await db.historyDays.count()).toBe(0);
    expect((await db.knowledge.toArray()).filter(point => point.source === 'import')).toHaveLength(0);
  });

  it('writes days and knowledge but never scores or completion', async () => {
    const parsed = parseHistoryImport(JSON.stringify(fixture));
    const coursesBefore = await db.courses.count();
    await applyHistoryImport(parsed, { markWeakpointsForReview: true });

    const days = await db.historyDays.toArray();
    expect(days).toHaveLength(3);
    expect(days.find(day => day.dayNumber === 16)?.evidence).toBe('listed_only');
    expect(days.find(day => day.dayNumber === 18)?.evidence).toBe('studied');

    const imported = (await db.knowledge.toArray()).filter(point => point.source === 'import');
    expect(imported.filter(point => point.status === 'needs_review')).toHaveLength(HISTORY_WEAK_POINTS.length);
    expect(imported.filter(point => point.status === 'learning')).toHaveLength(2);
    expect(await db.courses.count()).toBe(coursesBefore);
    expect(await db.answers.count()).toBe(0);
    expect(await db.grades.count()).toBe(0);
    expect((await db.settings.get('app'))?.historyImportedAt).toBeGreaterThan(0);
  });

  it('is idempotent for a repeated import', async () => {
    const parsed = parseHistoryImport(JSON.stringify(fixture));
    await applyHistoryImport(parsed, { markWeakpointsForReview: true });
    await applyHistoryImport(parsed, { markWeakpointsForReview: true });
    expect(await db.historyDays.count()).toBe(3);
    expect((await db.knowledge.toArray()).filter(point => point.source === 'import')).toHaveLength(7);
  });
});
