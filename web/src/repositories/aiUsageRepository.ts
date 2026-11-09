import { db } from '../db/db';
import type { AiCallKind, AiCallStatus } from '../types/domain';
import { todayKey } from '../utils/date';

export interface AiUsageSummary {
  requests: number;
  tokens: number;
}

export async function recordAiUsage(input: {
  kind: AiCallKind;
  model: string;
  tokensIn: number;
  tokensOut: number;
  status: AiCallStatus;
}): Promise<void> {
  await db.aiUsage.put({
    id: `${input.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dateKey: todayKey(),
    kind: input.kind,
    model: input.model,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    status: input.status,
    createdAt: Date.now()
  });
}

export async function getTodayUsage(): Promise<AiUsageSummary> {
  const records = await db.aiUsage.where('dateKey').equals(todayKey()).toArray();
  return {
    requests: records.length,
    tokens: records.reduce((total, record) => total + record.tokensIn + record.tokensOut, 0)
  };
}
