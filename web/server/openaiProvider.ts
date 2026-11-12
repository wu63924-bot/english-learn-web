import type { ApiConfig } from './config.ts';
import { ApiError } from './errors.ts';
import type {
  AiProvider,
  Drill,
  DrillRequest,
  GeneratedCourse,
  GenerateCourseRequest,
  GradeRequest,
  GradeResult,
  PlanRequest,
  PlanResult,
  ProviderResult,
  TokenUsage,
  TutorAnswer,
  TutorRequest
} from './provider.ts';
import { courseMessages, drillMessages, gradeMessages, planMessages, tutorMessages } from './prompts.ts';
import { normalizeCourse, normalizeDrill, normalizeGrade, normalizePlan, normalizeTutor } from './schema.ts';

interface ChatResult {
  json: unknown;
  usage: TokenUsage;
}

/** OpenAI-compatible chat completions. Used only when AI_PROVIDER=openai. */
export class OpenAiProvider implements AiProvider {
  private readonly config: ApiConfig;
  private readonly request: typeof fetch;

  constructor(config: ApiConfig, request: typeof fetch = fetch) {
    this.config = config;
    this.request = request;
  }

  async generateCourse(request: GenerateCourseRequest, signal?: AbortSignal): Promise<ProviderResult<GeneratedCourse>> {
    const result = await this.chat(courseMessages(request), signal);
    return { data: normalizeCourse(result.json, `ai-${request.number}`), usage: result.usage };
  }

  async grade(request: GradeRequest, signal?: AbortSignal): Promise<ProviderResult<GradeResult>> {
    const result = await this.chat(gradeMessages(request), signal);
    return { data: normalizeGrade(result.json), usage: result.usage };
  }

  async tutor(request: TutorRequest, signal?: AbortSignal): Promise<ProviderResult<TutorAnswer>> {
    const result = await this.chat(tutorMessages(request), signal);
    return { data: normalizeTutor(result.json), usage: result.usage };
  }

  async generateDrill(request: DrillRequest, signal?: AbortSignal): Promise<ProviderResult<Drill>> {
    const result = await this.chat(drillMessages(request), signal);
    return { data: normalizeDrill(result.json), usage: result.usage };
  }

  async generatePlan(request: PlanRequest, signal?: AbortSignal): Promise<ProviderResult<PlanResult>> {
    const result = await this.chat(planMessages(request), signal);
    return { data: normalizePlan(result.json, request.count), usage: result.usage };
  }

  private async chat(messages: { role: string; content: string }[], signal?: AbortSignal): Promise<ChatResult> {
    const body = JSON.stringify({
      model: this.config.model,
      stream: false,
      temperature: 0.3,
      max_tokens: this.config.maxOutputTokens,
      ...(this.config.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(this.config.thinking !== 'default' ? { thinking: { type: this.config.thinking } } : {}),
      messages
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await this.request(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
          body,
          signal,
          redirect: 'error'
        });
      } catch {
        if (signal?.aborted) throw new ApiError('AI_TIMEOUT');
        if (attempt === 0) continue;
        throw new ApiError('AI_UNAVAILABLE');
      }

      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) throw new ApiError('AI_AUTH_ERROR', 'AI 服务鉴权失败');
        if (response.status === 429) throw new ApiError('AI_RATE_LIMIT', 'AI 服务限流');
        if (response.status >= 500 && attempt === 0) continue;
        if (response.status >= 500) throw new ApiError('AI_UNAVAILABLE');
        throw new ApiError('AI_BAD_RESPONSE', `AI 服务返回 ${response.status}`);
      }

      const payload = await response.json() as {
        choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      };
      const choice = payload.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        // DeepSeek's JSON mode can replace unusable output with spaces; retry once before failing.
        if (attempt === 0) continue;
        throw new ApiError('AI_BAD_RESPONSE', 'AI 返回空内容，请稍后重试或调整提示词');
      }
      if (choice?.finish_reason === 'length') {
        throw new ApiError('AI_BAD_RESPONSE', 'AI 输出被截断，请提高 AI_MAX_OUTPUT_TOKENS');
      }
      let parsed: unknown;
      try {
        parsed = extractJson(content);
      } catch (reason) {
        // A malformed or half-closed JSON object is worth one fresh attempt.
        if (attempt === 0) continue;
        throw reason;
      }
      return {
        json: parsed,
        usage: {
          inputTokens: tokenCount(payload.usage?.prompt_tokens),
          outputTokens: tokenCount(payload.usage?.completion_tokens)
        }
      };
    }
    throw new ApiError('AI_UNAVAILABLE');
  }
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new ApiError('AI_BAD_RESPONSE', 'AI 未返回 JSON');
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new ApiError('AI_BAD_RESPONSE', 'AI 返回的 JSON 无法解析');
  }
}
