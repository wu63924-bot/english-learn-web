import { createHash, createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Snapshot {
  text: string;
  updatedAt: string;
}

export interface SyncStore {
  driver(): 'file' | 'oss';
  read(): Promise<Snapshot | null>;
  write(text: string): Promise<{ bytes: number; updatedAt: string }>;
}

/** 本地开发与测试用的文件存储。 */
export function createFileSyncStore(path: string): SyncStore {
  return {
    driver: () => 'file',
    async read() {
      if (!existsSync(path)) return null;
      const [text, info] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
      if (!text) return null;
      return { text, updatedAt: info.mtime.toISOString() };
    },
    async write(text) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text, 'utf8');
      return { bytes: Buffer.byteLength(text), updatedAt: new Date().toISOString() };
    }
  };
}

export interface OssConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  key: string;
  /** 自定义域名或内网端点；默认按 bucket.region.aliyuncs.com */
  endpoint?: string;
}

/**
 * 阿里云 OSS 的最小实现：只用 V1 签名与 PUT/GET，两个依赖都不需要。
 * 快照是整份 JSON，不做分片或增量。
 */
export function createOssSyncStore(config: OssConfig): SyncStore {
  const host = config.endpoint
    ? config.endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')
    : `${config.bucket}.${config.region}.aliyuncs.com`;
  const url = `https://${host}/${encodeURI(config.key)}`;

  const authorization = (method: string, contentType: string, date: string): string => {
    const stringToSign = `${method}\n\n${contentType}\n${date}\n/${config.bucket}/${config.key}`;
    const signature = createHmac('sha1', config.accessKeySecret).update(stringToSign).digest('base64');
    return `OSS ${config.accessKeyId}:${signature}`;
  };

  return {
    driver: () => 'oss',
    async read() {
      const date = new Date().toUTCString();
      const response = await fetch(url, {
        method: 'GET',
        headers: { Date: date, Authorization: authorization('GET', '', date) }
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`OSS 读取失败（${response.status}）`);
      const text = await response.text();
      return { text, updatedAt: response.headers.get('last-modified') ?? new Date().toISOString() };
    },
    async write(text) {
      const date = new Date().toUTCString();
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Date: date,
          'Content-Type': 'application/json',
          Authorization: authorization('PUT', 'application/json', date)
        },
        body: text
      });
      if (!response.ok) throw new Error(`OSS 写入失败（${response.status}）`);
      return { bytes: Buffer.byteLength(text), updatedAt: new Date().toISOString() };
    }
  };
}

/** 快照内容指纹，用于显示与冲突提示，不参与鉴权。 */
export function snapshotDigest(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
