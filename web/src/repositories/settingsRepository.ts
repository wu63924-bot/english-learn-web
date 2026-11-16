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
export async function getWordSession(): Promise<WordSession | undefined> {
  const settings = await db.settings.get('app');
  return settings?.wordSession;
}

export async function saveWordSession(session: WordSession): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  await db.settings.put({ ...settings, wordSession: session, updatedAt: Date.now() });
}

export async function clearWordSession(): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings?.wordSession) return;
  await db.settings.put({ ...settings, wordSession: undefined, updatedAt: Date.now() });
}
