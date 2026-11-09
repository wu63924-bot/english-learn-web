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
  mockLatencyMs: number;
  maxOutputTokens: number;
  jsonMode: boolean;
  thinking: 'enabled' | 'disabled' | 'default';
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
    mockLatencyMs: positiveInteger(env.MOCK_LATENCY_MS, 0),
    maxOutputTokens: positiveInteger(env.AI_MAX_OUTPUT_TOKENS, 6000),
    jsonMode: env.AI_JSON_MODE?.trim() !== 'off',
    thinking: env.AI_THINKING?.trim() === 'enabled'
      ? 'enabled'
      : env.AI_THINKING?.trim() === 'default'
        ? 'default'
        : 'disabled'
  };
}
