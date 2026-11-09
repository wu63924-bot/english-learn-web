import { describe, expect, it } from 'vitest';
import type { ApiConfig } from './config.ts';
import { ApiError } from './errors.ts';
import { OpenAiProvider } from './openaiProvider.ts';

const config: ApiConfig = {
  provider: 'openai',
  apiKey: 'test-key',
  baseUrl: 'https://example.invalid/compatible-mode/v1',
  model: 'test-model',
  host: '127.0.0.1',
  port: 0,
  timeoutMs: 1_000,
  rateLimitMax: 100,
  rateLimitWindowMs: 60_000,
  maxConcurrent: 2,
  dailyRequestLimit: 100,
  dailyTokenLimit: 100_000,
  allowedOrigins: [],
  mockLatencyMs: 0,
  maxOutputTokens: 1_000,
  jsonMode: true
};

function respond(content: unknown, status = 200, usage = { prompt_tokens: 12, completion_tokens: 30 }): typeof fetch {
  return (async () => new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })) as typeof fetch;
}

describe('OpenAI-compatible provider', () => {
  it('parses a valid grade response and keeps token usage', async () => {
    const provider = new OpenAiProvider(config, respond('{"status":"partial","feedback":"漏了时间状语"}'));
    const result = await provider.grade({ prompt: '译成中文', reference: '他昨天到了。', answer: '他到了。' });
    expect(result.data.status).toBe('partial');
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 30 });
  });

  it('accepts JSON inside a code fence', async () => {
    const provider = new OpenAiProvider(config, respond('```json\n{"answer":"第三人称单数要加 -s。"}\n```'));
    const result = await provider.tutor({ question: '为什么加 s？' });
    expect(result.data.answer).toContain('-s');
  });

  it('rejects non-JSON model output', async () => {
    const provider = new OpenAiProvider(config, respond('抱歉，我无法回答。'));
    await expect(provider.tutor({ question: 'why' })).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });
  });

  it('maps auth, rate limit and server errors', async () => {
    await expect(new OpenAiProvider(config, respond('{}', 401)).tutor({ question: 'q' }))
      .rejects.toBeInstanceOf(ApiError);
    await expect(new OpenAiProvider(config, respond('{}', 401)).tutor({ question: 'q' }))
      .rejects.toMatchObject({ code: 'AI_AUTH_ERROR' });
    await expect(new OpenAiProvider(config, respond('{}', 429)).tutor({ question: 'q' }))
      .rejects.toMatchObject({ code: 'AI_RATE_LIMIT' });
    await expect(new OpenAiProvider(config, respond('{}', 400)).tutor({ question: 'q' }))
      .rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });
  });

  it('retries once on a server error', async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      if (calls === 1) return new Response('oops', { status: 500 });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"重试成功"}' } }], usage: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as typeof fetch;
    const result = await new OpenAiProvider(config, fetcher).tutor({ question: 'q' });
    expect(result.data.answer).toBe('重试成功');
    expect(calls).toBe(2);
  });
});
