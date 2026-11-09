import { describe, expect, it } from 'vitest';
import { createApiServer } from './app.ts';
import type { ApiConfig } from './config.ts';
import { MockProvider } from './mockProvider.ts';
import type { AiProvider } from './provider.ts';
import { ApiError } from './errors.ts';

const base: ApiConfig = {
  provider: 'mock',
  apiKey: '',
  baseUrl: 'https://example.invalid/compatible-mode/v1',
  model: 'mock-model',
  host: '127.0.0.1',
  port: 0,
  timeoutMs: 1_000,
  rateLimitMax: 100,
  rateLimitWindowMs: 60_000,
  maxConcurrent: 2,
  dailyRequestLimit: 100,
  dailyTokenLimit: 100_000,
  allowedOrigins: ['http://localhost:5173'],
  mockLatencyMs: 0,
  maxOutputTokens: 1_000,
  jsonMode: true
};

async function start(overrides: Partial<ApiConfig> = {}, provider: AiProvider = new MockProvider({ mockLatencyMs: 0 })) {
  const server = createApiServer({ ...base, ...overrides }, { provider, log: () => undefined });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => { server.close(() => resolve()); })
  };
}

function post(url: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

describe('AI proxy', () => {
  it('reports health and usage', async () => {
    const app = await start();
    try {
      const response = await fetch(`${app.url}/health`);
      const payload = await response.json() as { ok: boolean; provider: string; usage: { requests: number } };
      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.provider).toBe('mock');
      expect(payload.usage.requests).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('generates a structurally valid course', async () => {
    const app = await start();
    try {
      const response = await post(app.url, '/api/course/generate', { number: 3, topic: 'travel plans', level: 'B1' });
      const payload = await response.json() as {
        data: { words: unknown[]; grammarQuestions: unknown[]; readingQuestions: { kind: string }[]; reviewQuestions: unknown[] };
        meta: { provider: string; cached: boolean };
        usage: { inputTokens: number };
      };
      expect(response.status).toBe(200);
      expect(payload.meta).toEqual({ provider: 'mock', cached: false });
      expect(payload.data.words).toHaveLength(5);
      expect(payload.data.grammarQuestions).toHaveLength(4);
      expect(payload.data.readingQuestions.map(question => question.kind)).toEqual(['choice', 'translate']);
      expect(payload.data.reviewQuestions).toHaveLength(2);
      expect(payload.usage.inputTokens).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('rejects an invalid request body', async () => {
    const app = await start();
    try {
      const response = await post(app.url, '/api/course/generate', { number: 0, topic: '' });
      const payload = await response.json() as { error: { code: string } };
      expect(response.status).toBe(400);
      expect(payload.error.code).toBe('INVALID_REQUEST');
    } finally {
      await app.close();
    }
  });

  it('blocks a foreign origin', async () => {
    const app = await start();
    try {
      const response = await post(app.url, '/api/tutor', { question: 'why' }, { Origin: 'https://evil.example' });
      expect(response.status).toBe(403);
      expect(await response.text()).toContain('ORIGIN_NOT_ALLOWED');
    } finally {
      await app.close();
    }
  });

  it('serves the same response for a repeated idempotency key', async () => {
    const app = await start();
    try {
      const first = await post(app.url, '/api/grade', {
        prompt: '翻译：他迟到了。',
        reference: '他迟到了。',
        answer: '他迟到了。'
      }, { 'Idempotency-Key': 'lesson-3-grade-1' });
      const second = await post(app.url, '/api/grade', {
        prompt: '翻译：他迟到了。',
        reference: '他迟到了。',
        answer: '他迟到了。'
      }, { 'Idempotency-Key': 'lesson-3-grade-1' });
      const firstPayload = await first.json() as { data: unknown; meta: { cached: boolean } };
      const secondPayload = await second.json() as { data: unknown; meta: { cached: boolean } };
      expect(firstPayload.meta.cached).toBe(false);
      expect(secondPayload.meta.cached).toBe(true);
      expect(secondPayload.data).toEqual(firstPayload.data);
    } finally {
      await app.close();
    }
  });

  it('rate limits requests above the window limit', async () => {
    const app = await start({ rateLimitMax: 2 });
    try {
      const body = { prompt: 'p', reference: 'r', answer: 'a' };
      expect((await post(app.url, '/api/grade', body)).status).toBe(200);
      expect((await post(app.url, '/api/grade', body)).status).toBe(200);
      const third = await post(app.url, '/api/grade', body);
      expect(third.status).toBe(429);
      expect((await third.json() as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
    } finally {
      await app.close();
    }
  });

  it('enforces the daily request budget', async () => {
    const app = await start({ dailyRequestLimit: 1 });
    try {
      const body = { question: 'why' };
      expect((await post(app.url, '/api/tutor', body)).status).toBe(200);
      const second = await post(app.url, '/api/tutor', body);
      expect(second.status).toBe(402);
      expect((await second.json() as { error: { code: string } }).error.code).toBe('BUDGET_EXCEEDED');
    } finally {
      await app.close();
    }
  });

  it('rejects oversized payloads', async () => {
    const app = await start();
    try {
      const big = { question: 'x'.repeat(70_000) };
      const response = await post(app.url, '/api/tutor', big);
      expect(response.status).toBe(413);
    } finally {
      await app.close();
    }
  });

  it('returns a timeout instead of hanging', async () => {
    const hanging: AiProvider = {
      generateCourse: (_request, signal) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
      grade: async () => { throw new ApiError('AI_UNAVAILABLE'); },
      tutor: async () => { throw new ApiError('AI_UNAVAILABLE'); }
    };
    const app = await start({ timeoutMs: 50 }, hanging);
    try {
      const response = await post(app.url, '/api/course/generate', { number: 1, topic: 'timeouts' });
      expect(response.status).toBe(504);
      expect((await response.json() as { error: { code: string } }).error.code).toBe('AI_TIMEOUT');
    } finally {
      await app.close();
    }
  });

  it('grades and answers through the mock provider', async () => {
    const app = await start();
    try {
      const grade = await post(app.url, '/api/grade', { prompt: '译成中文', reference: '他迟到了。', answer: '他迟到了。' });
      const gradePayload = await grade.json() as { data: { status: string; feedback: string } };
      expect(gradePayload.data.status).toBe('correct');

      const tutor = await post(app.url, '/api/tutor', { question: '一般现在时怎么用？' });
      const tutorPayload = await tutor.json() as { data: { answer: string } };
      expect(tutorPayload.data.answer).toContain('模拟');
    } finally {
      await app.close();
    }
  });
});
