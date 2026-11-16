import { describe, expect, it } from 'vitest';
import { readConfig } from './config.ts';

const baseEnv = {
  SYNC_TOKEN: 'sync-secret',
  SYNC_OSS_BUCKET: 'english-learn-sync',
  SYNC_OSS_REGION: 'oss-cn-beijing',
  SYNC_OSS_ACCESS_KEY_ID: 'ak',
  SYNC_OSS_ACCESS_KEY_SECRET: 'sk'
} as unknown as NodeJS.ProcessEnv;

describe('sync config', () => {
  it('accepts a plain host and strips protocol, brackets and trailing slash', () => {
    expect(readConfig({ ...baseEnv, SYNC_OSS_ENDPOINT: 'https://<english-learn-sync>.oss-cn-beijing-internal.aliyuncs.com/' }).oss?.endpoint)
      .toBe('english-learn-sync.oss-cn-beijing-internal.aliyuncs.com');
    expect(readConfig({ ...baseEnv, SYNC_OSS_ENDPOINT: ' english-learn-sync.oss-cn-beijing.aliyuncs.com ' }).oss?.endpoint)
      .toBe('english-learn-sync.oss-cn-beijing-internal.aliyuncs.com'.replace('-internal', ''));
  });

  it('drops values that are not a hostname so the default endpoint applies', () => {
    expect(readConfig({ ...baseEnv, SYNC_OSS_ENDPOINT: '<bucket>' }).oss?.endpoint).toBeUndefined();
    expect(readConfig({ ...baseEnv, SYNC_OSS_ENDPOINT: 'not a url' }).oss?.endpoint).toBeUndefined();
  });

  it('falls back to the local store when the bucket is missing', () => {
    const config = readConfig({ SYNC_TOKEN: 'sync-secret', SYNC_OSS_REGION: 'oss-cn-beijing' } as unknown as NodeJS.ProcessEnv);
    expect(config.oss).toBeUndefined();
    expect(config.syncToken).toBe('sync-secret');
    expect(config.syncStorePath).toBe('');
  });
});
