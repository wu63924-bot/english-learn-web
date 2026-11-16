export interface ApiConfig {
  provider: 'mock' | 'openai';
  apiKey: string;
  baseUrl: string;
  model: string;
  host: string;
  port: number;
  timeoutMs: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  maxConcurrent: number;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  allowedOrigins: string[];
  accessToken: string;
  mockLatencyMs: number;
  maxOutputTokens: number;
  jsonMode: boolean;
  thinking: 'enabled' | 'disabled' | 'default';
  /** 设备同步口令；为空时同步接口关闭 */
  syncToken: string;
  /** 本地开发时的快照文件 */
  syncStorePath: string;
  oss?: {
    bucket: string;
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    key: string;
    endpoint?: string;
  };
}

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const OPENAI_BASE = 'https://api.deepseek.com';

function positiveInteger(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function origins(value: string | undefined): string[] {
  if (!value) return DEFAULT_ORIGINS;
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const provider = env.AI_PROVIDER?.trim() === 'openai' ? 'openai' : 'mock';
  const apiKey = env.AI_API_KEY?.trim() || '';
  const baseUrl = (env.AI_BASE_URL?.trim() || OPENAI_BASE).replace(/\/+$/, '');

  if (provider === 'openai') {
    if (!apiKey) throw new Error('AI_PROVIDER=openai 时必须配置 AI_API_KEY');
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('AI_BASE_URL 必须是 HTTPS 地址，且不能包含账号信息');
    }
  }

  return {
    provider,
    apiKey,
    baseUrl,
    model: env.AI_MODEL?.trim() || 'deepseek-flash',
    host: env.HOST?.trim() || '127.0.0.1',
    port: positiveInteger(env.PORT, 8788),
    timeoutMs: positiveInteger(env.AI_TIMEOUT_MS, 30_000),
    rateLimitMax: positiveInteger(env.AI_RATE_LIMIT_MAX, 20),
    rateLimitWindowMs: positiveInteger(env.AI_RATE_LIMIT_WINDOW_MS, 60_000),
    maxConcurrent: positiveInteger(env.AI_MAX_CONCURRENT, 2),
    dailyRequestLimit: positiveInteger(env.AI_DAILY_REQUEST_LIMIT, 60),
    dailyTokenLimit: positiveInteger(env.AI_DAILY_TOKEN_LIMIT, 200_000),
    allowedOrigins: origins(env.ALLOWED_ORIGINS),
    accessToken: env.AI_ACCESS_TOKEN?.trim() || '',
    mockLatencyMs: positiveInteger(env.MOCK_LATENCY_MS, 0),
    maxOutputTokens: positiveInteger(env.AI_MAX_OUTPUT_TOKENS, 8000),
    jsonMode: env.AI_JSON_MODE?.trim() !== 'off',
    thinking: env.AI_THINKING?.trim() === 'enabled'
      ? 'enabled'
      : env.AI_THINKING?.trim() === 'default'
        ? 'default'
        : 'disabled',
    syncToken: env.SYNC_TOKEN?.trim() || '',
    syncStorePath: env.SYNC_STORE_PATH?.trim() || '',
    oss: ossConfig(env)
  };
}

/** 只有 bucket、区域和一对密钥齐全时才启用 OSS；缺任何一项就回落到本地文件。 */
function ossConfig(env: NodeJS.ProcessEnv): ApiConfig['oss'] {
  const bucket = env.SYNC_OSS_BUCKET?.trim();
  const region = env.SYNC_OSS_REGION?.trim();
  const accessKeyId = env.SYNC_OSS_ACCESS_KEY_ID?.trim() || env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim();
  const accessKeySecret = env.SYNC_OSS_ACCESS_KEY_SECRET?.trim() || env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim();
  if (!bucket || !region || !accessKeyId || !accessKeySecret) return undefined;
  return {
    bucket,
    region,
    accessKeyId,
    accessKeySecret,
    key: env.SYNC_OSS_KEY?.trim() || 'english-learn/snapshot.json',
    endpoint: endpoint(env.SYNC_OSS_ENDPOINT)
  };
}

/**
 * 允许直接粘贴域名；占位符里的尖括号、协议和末尾斜杠都清掉。
 * 清完仍然不像域名时返回 undefined，让默认地址生效。
 */
function endpoint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[<>"'\s]/g, '')
    .replace(/\/+$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned) ? cleaned : undefined;
}
