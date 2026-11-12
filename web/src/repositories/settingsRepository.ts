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
