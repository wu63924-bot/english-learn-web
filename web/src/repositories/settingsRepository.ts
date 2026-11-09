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
