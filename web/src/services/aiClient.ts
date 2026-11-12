import type { AiCallKind, AiCallStatus } from '../types/domain';
import { recordAiUsage } from '../repositories/aiUsageRepository';
import { getAiAccessToken } from '../repositories/settingsRepository';
import { assertGeneratedCourse, type GeneratedCoursePayload } from './coursePayload';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8788';

export type AiErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'BAD_PAYLOAD'
  | 'BUDGET_EXCEEDED'
  | 'RATE_LIMITED'
  | 'AI_BAD_RESPONSE'
  | 'AI_UNAVAILABLE'
  | 'AI_AUTH_ERROR'
  | 'UNKNOWN';

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function aiBaseUrl(): string {
  const configured = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_AI_API_URL as string | undefined : undefined;
  return configured?.trim() || DEFAULT_BASE_URL;
}

const inflight = new Map<string, Promise<unknown>>();

interface Envelope<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number };
  meta: { provider: string; cached: boolean };
}

interface CallOptions {
  idempotencyKey: string;
  kind: AiCallKind;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AiCallOverrides {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function call<T>(path: string, body: unknown, options: CallOptions): Promise<Envelope<T>> {
  const existing = inflight.get(options.idempotencyKey);
  if (existing) return existing as Promise<Envelope<T>>;

  const task = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 40_000);
    let response: Response;
    try {
      const accessToken = await getAiAccessToken().catch(() => '');
      response = await (options.fetchImpl ?? fetch)(`${aiBaseUrl()}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': options.idempotencyKey,
          ...(accessToken ? { 'X-Access-Token': accessToken } : {})
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch {
      if (controller.signal.aborted) throw new AiError('TIMEOUT', 'AI 请求超时，稍后再试');
      throw new AiError('NETWORK', '无法连接 AI 代理，请确认已运行 npm run dev:api');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      throw mapError(payload?.error?.code, payload?.error?.message);
    }

    const payload = await response.json().catch(() => null) as Envelope<T> | null;
    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
      throw new AiError('BAD_PAYLOAD', 'AI 代理返回格式异常，内容未写入');
    }
    await recordUsage(options.kind, payload).catch(() => undefined);
    return payload;
  })().finally(() => inflight.delete(options.idempotencyKey));

  inflight.set(options.idempotencyKey, task);
  return task;
}

async function recordUsage(kind: AiCallKind, payload: Envelope<unknown>): Promise<void> {
  const status: AiCallStatus = 'ok';
  await recordAiUsage({
    kind,
    model: payload.meta?.provider ?? 'unknown',
    tokensIn: payload.usage?.inputTokens ?? 0,
    tokensOut: payload.usage?.outputTokens ?? 0,
    status
  });
}

function mapError(code: string | undefined, message: string | undefined): AiError {
  const text = message?.trim();
  switch (code) {
    case 'BUDGET_EXCEEDED':
      return new AiError('BUDGET_EXCEEDED', text || '今日 AI 用量已达上限');
    case 'UNAUTHORIZED':
      return new AiError('UNAUTHORIZED', text || '需要访问口令，请在设置中填写');
    case 'RATE_LIMITED':
      return new AiError('RATE_LIMITED', text || '请求太频繁，请稍后再试');
    case 'BUSY':
      return new AiError('AI_UNAVAILABLE', text || 'AI 服务忙，请稍后再试');
    case 'AI_TIMEOUT':
      return new AiError('TIMEOUT', text || 'AI 响应超时');
    case 'AI_AUTH_ERROR':
      return new AiError('AI_AUTH_ERROR', text || 'AI 服务鉴权失败，请检查服务端配置');
    case 'AI_RATE_LIMIT':
      return new AiError('RATE_LIMITED', text || 'AI 服务限流，请稍后再试');
    case 'AI_BAD_RESPONSE':
      return new AiError('AI_BAD_RESPONSE', text || 'AI 返回内容不合法，已忽略');
    case 'AI_UNAVAILABLE':
      return new AiError('AI_UNAVAILABLE', text || 'AI 服务暂不可用');
    default:
      return new AiError('UNKNOWN', text || 'AI 请求失败');
  }
}

export interface GenerateCourseInput {
  number: number;
  topic: string;
  focus?: string;
  level?: string;
  goal?: string;
}

export async function generateCourse(input: GenerateCourseInput, overrides: AiCallOverrides = {}): Promise<{ course: GeneratedCoursePayload; provider: 'mock' | 'live' }> {
  const envelope = await call<unknown>('/api/course/generate', input, {
    idempotencyKey: `generate-${input.number}-${hash(input.topic)}`,
    kind: 'generate',
    ...overrides
  });
  try {
    return {
      course: assertGeneratedCourse(envelope.data),
      provider: envelope.meta?.provider === 'openai' ? 'live' : 'mock'
    };
  } catch (reason) {
    throw new AiError('BAD_PAYLOAD', reason instanceof Error ? `AI 返回的课程不可用：${reason.message}` : 'AI 返回的课程不可用');
  }
}

export interface GradeAnswerInput {
  courseId: string;
  moduleId: string;
  questionId: string;
  prompt: string;
  reference: string;
  answer: string;
  keyPoints?: string[];
}

export interface AiGrade {
  status: 'correct' | 'partial' | 'uncertain';
  feedback: string;
}

export async function gradeAnswer(input: GradeAnswerInput, overrides: AiCallOverrides = {}): Promise<AiGrade> {
  const envelope = await call<AiGrade>('/api/grade', {
    prompt: input.prompt,
    reference: input.reference,
    answer: input.answer,
    keyPoints: input.keyPoints
  }, {
    idempotencyKey: `grade-${input.courseId}-${input.questionId}-${hash(input.answer)}`,
    kind: 'grade',
    ...overrides
  });
  const status = envelope.data?.status;
  if (status !== 'correct' && status !== 'partial' && status !== 'uncertain') {
    throw new AiError('BAD_PAYLOAD', 'AI 批改结果不合法，已忽略');
  }
  return { status, feedback: typeof envelope.data.feedback === 'string' ? envelope.data.feedback : '' };
}

export async function askTutor(input: { question: string; context?: string }, overrides: AiCallOverrides = {}): Promise<string> {
  const envelope = await call<{ answer: string }>('/api/tutor', input, {
    idempotencyKey: `tutor-${hash(`${input.question}|${input.context ?? ''}`)}`,
    kind: 'tutor',
    ...overrides
  });
  if (typeof envelope.data?.answer !== 'string' || !envelope.data.answer.trim()) {
    throw new AiError('BAD_PAYLOAD', 'AI 回答为空，已忽略');
  }
  return envelope.data.answer;
}

export interface AiHealth {
  provider: string;
  requests: number;
  tokens: number;
  maxRequests: number;
  maxTokens: number;
  authRequired: boolean;
}

export interface DrillResult {
  prompt: string;
  options: { id: string; label: string }[];
  answerId: string;
  explanation: string;
}

export async function generateDrill(input: { label: string; context?: string }, overrides: AiCallOverrides = {}): Promise<DrillResult> {
  const envelope = await call<DrillResult>('/api/drill', input, {
    idempotencyKey: `drill-${hash(`${input.label}|${input.context ?? ''}`)}`,
    kind: 'drill',
    ...overrides
  });
  const data = envelope.data;
  if (!data || typeof data.prompt !== 'string' || !Array.isArray(data.options) || data.options.length < 2
    || typeof data.answerId !== 'string' || !data.options.some(option => option.id === data.answerId)
    || typeof data.explanation !== 'string') {
    throw new AiError('BAD_PAYLOAD', 'AI 返回的练习题不完整，已忽略');
  }
  return data;
}

export interface PlanUnitResult {
  topic: string;
  grammar: string;
  vocabulary: string;
  goal: string;
  level?: string;
}

export async function generatePlan(
  input: { startNumber: number; startLevel: string; targetLevel: string; learned: string[] },
  overrides: AiCallOverrides = {}
): Promise<PlanUnitResult[]> {
  const envelope = await call<{ units: PlanUnitResult[] }>('/api/plan', input, {
    idempotencyKey: `plan-${hash(`${input.startNumber}|${input.startLevel}|${input.targetLevel}|${input.learned.length}`)}`,
    kind: 'plan',
    ...overrides
  });
  const units = envelope.data?.units;
  if (!Array.isArray(units) || units.length !== 10
    || units.some(unit => !unit || typeof unit.topic !== 'string' || typeof unit.grammar !== 'string')) {
    throw new AiError('BAD_PAYLOAD', 'AI 返回的路线不完整，已忽略');
  }
  return units;
}

export async function getAiHealth(overrides: AiCallOverrides = {}): Promise<AiHealth | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await (overrides.fetchImpl ?? fetch)(`${aiBaseUrl()}/health`, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json() as { provider?: unknown; authRequired?: unknown; usage?: { requests?: unknown; tokens?: unknown; maxRequests?: unknown; maxTokens?: unknown } };
    return {
      provider: typeof payload.provider === 'string' ? payload.provider : 'unknown',
      requests: numberOrZero(payload.usage?.requests),
      tokens: numberOrZero(payload.usage?.tokens),
      maxRequests: numberOrZero(payload.usage?.maxRequests),
      maxTokens: numberOrZero(payload.usage?.maxTokens),
      authRequired: payload.authRequired === true
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function hash(text: string): string {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) {
    value = ((value << 5) + value + text.charCodeAt(index)) >>> 0;
  }
  return value.toString(36);
}

