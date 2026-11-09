import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiConfig } from './config.ts';
import { ApiError } from './errors.ts';
import type { AiProvider, TokenUsage } from './provider.ts';
import { RateLimiter } from './rateLimiter.ts';
import { parseDrillRequest, parseGenerateRequest, parseGradeRequest, parseTutorRequest } from './schema.ts';
import { UsageLedger } from './usage.ts';

const MAX_BODY_BYTES = 64 * 1024;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export interface ApiDeps {
  provider: AiProvider;
  log?: (entry: Record<string, unknown>) => void;
  now?: () => number;
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
  const log = deps.log ?? ((entry: Record<string, unknown>) => console.info(JSON.stringify(entry)));
  let active = 0;

  const routes: Record<string, RouteHandler> = {
    '/api/course/generate': async (body, signal) => deps.provider.generateCourse(parseGenerateRequest(body), signal),
    '/api/grade': async (body, signal) => deps.provider.grade(parseGradeRequest(body), signal),
    '/api/tutor': async (body, signal) => deps.provider.tutor(parseTutorRequest(body), signal),
    '/api/drill': async (body, signal) => deps.provider.generateDrill(parseDrillRequest(body), signal)
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
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Cache-Control', 'no-store');

      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
        res.setHeader('Access-Control-Max-Age', '600');
        status = 204;
        code = 'PREFLIGHT';
        res.writeHead(204).end();
        return;
      }

      if (path === '/health' && req.method === 'GET') {
        send(res, 200, { ok: true, provider: config.provider, usage: ledger.snapshot() });
        return;
      }

      const handler = routes[path];
      if (!handler) throw new ApiError('NOT_FOUND', '接口不存在');
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        throw new ApiError('METHOD_NOT_ALLOWED', '只支持 POST');
      }
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
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', '请求体过大');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      throw new ApiError('PAYLOAD_TOO_LARGE', '请求体过大');
    }
    chunks.push(buffer);
  }
  if (!chunks.length) throw new ApiError('INVALID_REQUEST', '请求体为空');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError('INVALID_REQUEST', '请求体不是有效 JSON');
  }
}
