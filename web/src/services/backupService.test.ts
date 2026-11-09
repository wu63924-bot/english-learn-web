import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import { backupCounts, createBackup, parseBackup, restoreBackup } from './backupService';

async function freshBackupText(): Promise<string> {
  const backup = await createBackup();
  return JSON.stringify(backup);
}

describe('backup service', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  it('exports data that its own parser accepts', async () => {
    await db.settings.update('app', { aiAccessToken: 'secret-token' });
    const backup = await createBackup();
    expect(backup.app).toBe('EnglishLearn');
    expect(backup.version).toBe(4);
    expect(backup.data.courses).toHaveLength(2);
    expect(backup.data.settings[0]?.aiAccessToken).toBeUndefined();
    expect((await db.settings.get('app'))?.aiAccessToken).toBe('secret-token');
    const parsed = parseBackup(JSON.stringify(backup));
    expect(backupCounts(parsed)).toEqual({ courses: 2, answers: 0, mistakes: 0, studyDays: 0, historyDays: 0 });
  });

  it('accepts a version 2 backup and fills the pending queue table', async () => {
    const legacy = JSON.parse(await freshBackupText());
    legacy.version = 2;
    delete legacy.data.pendingAi;
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.version).toBe(4);
    expect(parsed.data.pendingAi).toEqual([]);
    expect(parsed.data.wordReviews).toEqual([]);
  });

  it('accepts a version 1 backup and fills the new table', async () => {
    const legacy = JSON.parse(await freshBackupText());
    legacy.version = 1;
    delete legacy.data.historyDays;
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.version).toBe(4);
    expect(parsed.data.historyDays).toEqual([]);
  });

  it('rejects damaged or unrelated files', async () => {
    expect(() => parseBackup('{ not json')).toThrow('文件不是有效的 JSON');
    expect(() => parseBackup(JSON.stringify({ app: 'OtherApp', version: 1, data: {} }))).toThrow('这不是本应用的备份文件');
    expect(() => parseBackup(JSON.stringify({ app: 'EnglishLearn', version: 99, data: {} }))).toThrow('不支持的备份版本');
    expect(() => parseBackup(JSON.stringify({ app: 'EnglishLearn', version: 1 }))).toThrow('备份缺少数据段');

    const backup = JSON.parse(await freshBackupText());
    backup.data.courses = [backup.data.courses[0], backup.data.courses[0]];
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('重复的数据标识');

    const broken = JSON.parse(await freshBackupText());
    broken.data.answers = [{
      id: 'a1', courseId: 'missing-course', moduleId: 'm', questionId: 'q',
      questionKind: 'choice', value: 'x', dateKey: '2026-11-09', updatedAt: 1
    }];
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('数据引用不完整');

    const noSettings = JSON.parse(await freshBackupText());
    noSettings.data.settings = [];
    expect(() => parseBackup(JSON.stringify(noSettings))).toThrow('字段格式不正确');

    const badModule = JSON.parse(await freshBackupText());
    badModule.data.courseModules[0].content = { words: 'not-an-array' };
    expect(() => parseBackup(JSON.stringify(badModule))).toThrow('字段格式不正确');
  });

  it('restores a backup and drops newer local changes', async () => {
    const text = await freshBackupText();
    const backup = parseBackup(text);

    await db.courses.put({
      id: 'local-only', number: 99, title: 'Local', topic: 't', goal: 'g',
      source: 'sample', status: 'not_started', createdAt: 1, updatedAt: 1
    });
    expect((await db.courses.get('local-only'))?.id).toBe('local-only');

    await restoreBackup(backup);
    expect(await db.courses.get('local-only')).toBeUndefined();
    expect(await db.courses.count()).toBe(2);
    expect((await db.settings.get('app'))?.id).toBe('app');
  });

  it('leaves data untouched when parsing fails', async () => {
    const before = await db.courses.count();
    expect(() => parseBackup('{"app":"EnglishLearn","version":1,"data":{"courses":[]}}')).toThrow();
    expect(await db.courses.count()).toBe(before);
  });
});
