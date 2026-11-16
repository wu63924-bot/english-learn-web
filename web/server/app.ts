import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiConfig } from './config.ts';
import { ApiError } from './errors.ts';
import type { AiProvider, TokenUsage } from './provider.ts';
import { RateLimiter } from './rateLimiter.ts';
import { parseDrillRequest, parseGenerateRequest, parseGradeRequest, parsePlanRequest, parseTutorRequest } from './schema.ts';
import { createFileSyncStore, createOssSyncStore, type SyncStore } from './syncStore.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UsageLedger } from './usage.ts';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_SYNC_BYTES = 8 * 1024 * 1024;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export interface ApiDeps {
  provider: AiProvider;
  log?: (entry: Record<string, unknown>) => void;
  now?: () => number;
  /** 设备同步存储；测试注入内存实现，生产按配置使用 OSS 或本地文件 */
  syncStore?: SyncStore;
}

interface RouteResult {
  data: unknown;
  usage: TokenUsage;
}

type RouteHandler = (body: unknown, signal: AbortSignal) => Promise<RouteResult>;

export function createApiServer(config: ApiConfig, deps: ApiDeps) {
  const limiter = new RateLimiter(config.rateLimitMax, config.rateLimitWindowMs, deps.now ?? Date.now);
  const ledger = new UsageLedger(config.dailyRequestLimit, config.dailyTokenLimit);
  const idempotent = new Map<string, { expires: number; result: RouteResult }>();
  const allowedOrigins = new Set(config.allowedOrigins);
  const accessToken = config.accessToken;
  const hasAccess = (req: IncomingMessage): boolean => {
    if (!accessToken) return true;
    const provided = headerValue(req, 'x-access-token');
    if (!provided) return false;
    const expected = Buffer.from(accessToken);
    const actual = Buffer.from(provided);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  const log = deps.log ?? ((entry: Record<string, unknown>) => console.info(JSON.stringify(entry)));
  const syncStore = deps.syncStore ?? createConfiguredSyncStore(config);
  const hasSyncAccess = (req: IncomingMessage): boolean => {
    if (!config.syncToken) return false;
    const provided = headerValue(req, 'x-sync-token');
    if (!provided) return false;
    const expected = Buffer.from(config.syncToken);
    const actual = Buffer.from(provided);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  let active = 0;

  const routes: Record<string, RouteHandler> = {
    '/api/course/generate': async (body, signal) => deps.provider.generateCourse(parseGenerateRequest(body), signal),
    '/api/grade': async (body, signal) => deps.provider.grade(parseGradeRequest(body), signal),
    '/api/tutor': async (body, signal) => deps.provider.tutor(parseTutorRequest(body), signal),
    '/api/drill': async (body, signal) => deps.provider.generateDrill(parseDrillRequest(body), signal),
    '/api/plan': async (body, signal) => deps.provider.generatePlan(parsePlanRequest(body), signal)
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    const path = (req.url ?? '').split('?')[0];
    let status = 200;
    let code = 'OK';
    let tokensIn = 0;
    let tokensOut = 0;
    let cached = false;
    let timedOut = false;

    try {
      const origin = req.headers.origin;
      if (origin) {
        if (!allowedOrigins.has(origin)) throw new ApiError('ORIGIN_NOT_ALLOWED', '来源不在允许列表中');
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Expose-Headers', 'X-Snapshot-Updated-At');
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Cache-Control', 'no-store');

      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key, X-Access-Token, X-Sync-Token');
        res.setHeader('Access-Control-Max-Age', '600');
        status = 204;
        code = 'PREFLIGHT';
        res.writeHead(204).end();
        return;
      }

      if (path === '/health' && req.method === 'GET') {
        send(res, 200, { ok: true, provider: config.provider, authRequired: Boolean(accessToken), usage: ledger.snapshot() });
        return;
      }

      if (path === '/api/sync') {
        if (!config.syncToken || !syncStore) {
          throw new ApiError('SYNC_DISABLED', '服务端未配置同步口令或存储');
        }
        if (!hasSyncAccess(req)) throw new ApiError('UNAUTHORIZED', '同步口令不正确');
        if (req.method === 'GET') {
          const snapshot = await withSyncErrors(() => syncStore.read());
          if (!snapshot) throw new ApiError('SYNC_EMPTY', '云端还没有快照');
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Snapshot-Updated-At': snapshot.updatedAt
          });
          res.end(snapshot.text);
          return;
        }
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'GET, POST, OPTIONS');
          throw new ApiError('METHOD_NOT_ALLOWED', '只支持 GET 或 POST');
        }
        const text = await readText(req, MAX_SYNC_BYTES);
        const parsed = parseSnapshot(text);
        const written = await withSyncErrors(() => syncStore.write(JSON.stringify(parsed)));
        send(res, 200, { ok: true, bytes: written.bytes, updatedAt: written.updatedAt, driver: syncStore.driver() });
        return;
      }

      const handler = routes[path];
      if (!handler) throw new ApiError('NOT_FOUND', '接口不存在');
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        throw new ApiError('METHOD_NOT_ALLOWED', '只支持 POST');
      }
      if (!hasAccess(req)) throw new ApiError('UNAUTHORIZED', '需要访问口令，请在设置中填写');
      if (!limiter.allow(clientKey(req))) throw new ApiError('RATE_LIMITED', '请求过于频繁，请稍后再试');

      const idempotencyKey = headerValue(req, 'idempotency-key');
      if (idempotencyKey) {
        const hit = idempotent.get(idempotencyKey);
        if (hit && hit.expires > Date.now()) {
          cached = true;
          tokensIn = hit.result.usage.inputTokens;
          tokensOut = hit.result.usage.outputTokens;
          send(res, 200, envelope(hit.result, true, config.provider));
          return;
        }
      }

      ledger.check();
      if (active >= config.maxConcurrent) throw new ApiError('BUSY', '服务正忙，请稍后再试');
      const body = await readJson(req);

      const controller = new AbortController();
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, config.timeoutMs);
      active += 1;
      let result: RouteResult;
      try {
        result = await handler(body, controller.signal);
      } finally {
        active -= 1;
        clearTimeout(timer);
      }

      ledger.record(result.usage.inputTokens, result.usage.outputTokens);
      tokensIn = result.usage.inputTokens;
      tokensOut = result.usage.outputTokens;
      if (idempotencyKey) idempotent.set(idempotencyKey, { expires: Date.now() + IDEMPOTENCY_TTL_MS, result });
      send(res, 200, envelope(result, false, config.provider));
    } catch (reason) {
      const error = timedOut
        ? new ApiError('AI_TIMEOUT', 'AI 服务响应超时')
        : reason instanceof ApiError
          ? reason
          : new ApiError('INTERNAL_ERROR');
      status = error.status;
      code = error.code;
      if (!res.destroyed && !res.headersSent) {
        send(res, error.status, { error: { code: error.code, message: error.message } });
      }
    } finally {
      log({
        time: new Date().toISOString(),
        path,
        status,
        code,
        durationMs: Date.now() - started,
        tokensIn,
        tokensOut,
        cached,
        provider: config.provider
      });
    }
  });

  server.requestTimeout = config.timeoutMs + 5_000;
  server.headersTimeout = 15_000;
  return server;
}

function envelope(result: RouteResult, cached: boolean, provider: string) {
  return { data: result.data, usage: result.usage, meta: { provider, cached } };
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function clientKey(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (raw?.split(',')[0] ?? req.socket.remoteAddress ?? 'unknown').trim();
}

function headerValue(req: IncomingMessage, name: string): string {
  const value = req.headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= 120 ? trimmed : '';
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = String(req.headers['content-type'] ?? '');
  if (!type.includes('application/json')) throw new ApiError('INVALID_REQUEST', 'Content-Type 必须是 application/json');
  const text = await readText(req, MAX_BODY_BYTES);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('INVALID_REQUEST', '请求体不是有效 JSON');
  }
}

async function readText(req: IncomingMessage, limit: number): Promise<string> {
  const type = String(req.headers['content-type'] ?? '');
  if (!type.includes('application/json')) throw new ApiError('INVALID_REQUEST', 'Content-Type 必须是 application/json');
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw new ApiError('PAYLOAD_TOO_LARGE', '请求体过大');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) {
      req.resume();
      throw new ApiError('PAYLOAD_TOO_LARGE', '请求体过大');
    }
    chunks.push(buffer);
  }
  if (!chunks.length) throw new ApiError('INVALID_REQUEST', '请求体为空');
  return Buffer.concat(chunks).toString('utf8');
}

/** 服务端只做结构核对，真正的字段校验仍由客户端 parseBackup 完成。 */
function parseSnapshot(text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError('INVALID_REQUEST', '快照不是有效 JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new ApiError('INVALID_REQUEST', '快照结构不正确');
  const record = parsed as Record<string, unknown>;
  if (record.app !== 'EnglishLearn' || typeof record.version !== 'number' || !record.data || typeof record.data !== 'object') {
    throw new ApiError('INVALID_REQUEST', '不是本应用导出的备份');
  }
  return parsed;
}

/** 把 OSS 的 403、超时等底层错误转成可读错误码，避免只看到 INTERNAL_ERROR。 */
async function withSyncErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : '同步存储不可用';
    throw new ApiError('SYNC_STORAGE_ERROR', detail.slice(0, 180));
  }
}

function createConfiguredSyncStore(config: ApiConfig): SyncStore | undefined {
  if (!config.syncToken) return undefined;
  if (config.oss) return createOssSyncStore(config.oss);
  // FC 的代码目录只读，本地回退必须写到系统临时目录。
  const path = config.syncStorePath || join(tmpdir(), 'english-learn-sync', 'snapshot.json');
  return createFileSyncStore(path);
}
