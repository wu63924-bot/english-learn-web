import { aiBaseUrl } from './aiClient';

export interface CloudSnapshotInfo {
  text: string;
  updatedAt: string;
  bytes: number;
}

export class SyncError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

async function parseError(response: Response): Promise<SyncError> {
  let code = 'SYNC_FAILED';
  let message = `同步失败（${response.status}）`;
  try {
    const payload = await response.json() as { error?: { code?: string; message?: string } };
    if (payload.error?.code) code = payload.error.code;
    if (payload.error?.message) message = payload.error.message;
  } catch {
    // 保持默认提示
  }
  if (response.status === 401) message = '同步口令不正确，请检查后重试。';
  if (response.status === 404) message = '云端还没有快照。';
  if (response.status === 501) message = '服务端未启用设备同步。';
  return new SyncError(message, code, response.status);
}

/** 上传本机备份文本；快照内容由客户端生成，服务端只校验结构。 */
export async function uploadSnapshot(text: string, token: string): Promise<{ updatedAt: string; bytes: number }> {
  const response = await fetch(`${aiBaseUrl()}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sync-Token': token },
    body: text
  });
  if (!response.ok) throw await parseError(response);
  const payload = await response.json() as { updatedAt?: string; bytes?: number };
  return { updatedAt: payload.updatedAt ?? new Date().toISOString(), bytes: payload.bytes ?? text.length };
}

/** 读取云端快照；返回原始文本，交由 parseBackup 校验。 */
export async function downloadSnapshot(token: string): Promise<CloudSnapshotInfo> {
  const response = await fetch(`${aiBaseUrl()}/api/sync`, {
    headers: { 'X-Sync-Token': token }
  });
  if (!response.ok) throw await parseError(response);
  const text = await response.text();
  return {
    text,
    updatedAt: response.headers.get('X-Snapshot-Updated-At') ?? new Date().toISOString(),
    bytes: new Blob([text]).size
  };
}
