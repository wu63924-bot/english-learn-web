import { db } from '../db/db';

export interface ModulePosition {
  wordId?: string;
  questionId?: string;
}

/** 读取模块上次停留的位置；没有记录时返回 undefined。 */
export async function getModulePosition(moduleId: string): Promise<ModulePosition | undefined> {
  const settings = await db.settings.get('app');
  return settings?.modulePositions?.[moduleId];
}

/** 记住模块当前停留的位置，点进模块时从这里继续。 */
export async function saveModulePosition(moduleId: string, position: ModulePosition): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  const current = settings.modulePositions?.[moduleId] ?? {};
  const next = { ...current, ...position };
  if (next.wordId === current.wordId && next.questionId === current.questionId) return;
  await db.settings.put({
    ...settings,
    modulePositions: { ...(settings.modulePositions ?? {}), [moduleId]: next },
    updatedAt: Date.now()
  });
}
