import { db } from '../db/db';

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

export const DEFAULT_NEW_WORD_LIMIT = 10;

export async function getDailyNewWordLimit(): Promise<number> {
  const settings = await db.settings.get('app');
  const value = settings?.dailyNewWordLimit;
  return typeof value === 'number' && value >= 0 ? value : DEFAULT_NEW_WORD_LIMIT;
}

export async function setDailyNewWordLimit(limit: number): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  await db.settings.put({
    ...settings,
    dailyNewWordLimit: Math.min(30, Math.max(0, Math.round(limit))),
    updatedAt: Date.now()
  });
}
