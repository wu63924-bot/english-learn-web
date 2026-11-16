import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadSnapshot, SyncError, uploadSnapshot } from './syncClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sync client', () => {
  it('uploads the snapshot text with the sync token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, bytes: 12, updatedAt: '2026-11-16T00:00:00.000Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadSnapshot('{"app":"EnglishLearn"}', 'sync-secret');
    expect(result.bytes).toBe(12);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/sync');
    expect((init.headers as Record<string, string>)['X-Sync-Token']).toBe('sync-secret');
    expect(init.body).toBe('{"app":"EnglishLearn"}');
  });

  it('turns a wrong token into a readable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 })));
    await expect(uploadSnapshot('{}', 'bad')).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    });
    await expect(uploadSnapshot('{}', 'bad')).rejects.toBeInstanceOf(SyncError);
  });

  it('returns the cloud text and update time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"app":"EnglishLearn"}', {
      status: 200,
      headers: { 'X-Snapshot-Updated-At': '2026-11-16T08:00:00.000Z' }
    })));
    const snapshot = await downloadSnapshot('sync-secret');
    expect(snapshot.text).toBe('{"app":"EnglishLearn"}');
    expect(snapshot.updatedAt).toBe('2026-11-16T08:00:00.000Z');
  });

  it('explains an empty cloud and a disabled service', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'SYNC_EMPTY' } }), { status: 404 })));
    await expect(downloadSnapshot('sync-secret')).rejects.toThrow('云端还没有快照');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'SYNC_DISABLED' } }), { status: 501 })));
    await expect(downloadSnapshot('sync-secret')).rejects.toThrow('未启用设备同步');
  });
});
