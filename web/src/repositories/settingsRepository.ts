import { db } from '../db/db';
import type { WordSession } from '../types/domain';

export async function getAiAccessToken(): Promise<string> {
  const settings = await db.settings.get('app');
  return settings?.aiAccessToken?.trim() ?? '';
}

export async function setAiAccessToken(token: string): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  const trimmed = token.trim();
  await db.settings.put({
    ...settings,
    aiAccessToken: trimmed || undefined,
    updatedAt: Date.now()
  });
}

export async function getAutoSpeakWord(): Promise<boolean> {
  const settings = await db.settings.get('app');
  return settings?.autoSpeakWord === true;
}

export async function setAutoSpeakWord(enabled: boolean): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  await db.settings.put({
    ...settings,
    autoSpeakWord: enabled,
    updatedAt: Date.now()
  });
}

/** 读取进行中的单词队列；跨天由调用方判断是否作废。 */
export async function getWordSession(scope?: string): Promise<WordSession | undefined> {
  const settings = await db.settings.get('app');
  if (!settings) return undefined;
  if (!scope) return settings.wordSession;
  const byScope = settings.wordSessions?.[scope];
  if (byScope) return byScope;
  // 兼容第一版单字段存储。
  return settings.wordSession?.scope === scope ? settings.wordSession : undefined;
}

export async function saveWordSession(session: WordSession): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  const merged = { ...(settings.wordSessions ?? {}), [session.scope]: session };
  // 只保留最近的四个会话，避免设置无限增长。
  const kept = Object.entries(merged)
    .sort(([, left], [, right]) => right.startedAt - left.startedAt)
    .slice(0, 4);
  await db.settings.put({
    ...settings,
    wordSession: undefined,
    wordSessions: Object.fromEntries(kept),
    updatedAt: Date.now()
  });
}

export async function clearWordSession(scope?: string): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  if (!scope) {
    await db.settings.put({ ...settings, wordSession: undefined, wordSessions: undefined, updatedAt: Date.now() });
    return;
  }
  const merged = { ...(settings.wordSessions ?? {}) };
  delete merged[scope];
  await db.settings.put({ ...settings, wordSession: undefined, wordSessions: merged, updatedAt: Date.now() });
}
