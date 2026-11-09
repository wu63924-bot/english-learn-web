import { ApiError } from './errors.ts';
import type {
  GeneratedCourse,
  GenerateCourseRequest,
  GradeRequest,
  GradeResult,
  RawCourse,
  TutorAnswer,
  TutorRequest
} from './provider.ts';
import type { ChoiceQuestion, Question, WordItem } from '../src/types/domain.ts';

const LIMITS = {
  title: 120,
  topic: 120,
  goal: 200,
  level: 20,
  focus: 300,
  question: 2000,
  reference: 2000,
  answer: 4000,
  context: 4000,
  feedback: 1200,
  words: 8,
  sections: 4,
  questions: 8
};

function fail(message: string): never {
  throw new ApiError('INVALID_REQUEST', message);
}

function badOutput(): never {
  throw new ApiError('AI_BAD_RESPONSE', 'AI 返回内容不符合课程结构要求');
}

function text(value: unknown, field: string, max: number, request: boolean): string {
  if (typeof value !== 'string') {
    throw new ApiError(request ? 'INVALID_REQUEST' : 'AI_BAD_RESPONSE', request ? `${field} 必须是文本` : 'AI 返回内容不符合课程结构要求');
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) {
    throw new ApiError(
      request ? 'INVALID_REQUEST' : 'AI_BAD_RESPONSE',
      request ? `${field} 不能为空且不超过 ${max} 个字符` : 'AI 返回内容不符合课程结构要求'
    );
  }
  return trimmed;
}

function optionalText(value: unknown, max: number, request: boolean): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return text(value, '字段', max, request);
}

function integer(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${field} 必须是 ${min}–${max} 的整数`);
  }
  return value;
}

export function parseGenerateRequest(value: unknown): GenerateCourseRequest {
  if (!value || typeof value !== 'object') fail('请求体必须是对象');
  const body = value as Record<string, unknown>;
  const request: GenerateCourseRequest = {
    number: integer(body.number, 1, 999, 'number'),
    topic: text(body.topic, 'topic', LIMITS.topic, true)
  };
  const focus = optionalText(body.focus, LIMITS.focus, true);
  const level = optionalText(body.level, LIMITS.level, true);
  const goal = optionalText(body.goal, LIMITS.goal, true);
  if (focus) request.focus = focus;
  if (level) request.level = level;
  if (goal) request.goal = goal;
  return request;
}

export function parseGradeRequest(value: unknown): GradeRequest {
  if (!value || typeof value !== 'object') fail('请求体必须是对象');
  const body = value as Record<string, unknown>;
  const request: GradeRequest = {
    prompt: text(body.prompt, 'prompt', LIMITS.question, true),
    reference: text(body.reference, 'reference', LIMITS.reference, true),
    answer: text(body.answer, 'answer', LIMITS.answer, true)
  };
  if (body.keyPoints !== undefined) {
    if (!Array.isArray(body.keyPoints) || body.keyPoints.length > 10) fail('keyPoints 必须是最多 10 条的数组');
    const points = body.keyPoints.map(point => text(point, 'keyPoints', 60, true));
    if (points.length) request.keyPoints = points;
  }
  return request;
}

export function parseTutorRequest(value: unknown): TutorRequest {
  if (!value || typeof value !== 'object') fail('请求体必须是对象');
  const body = value as Record<string, unknown>;
  const request: TutorRequest = { question: text(body.question, 'question', 500, true) };
  const context = optionalText(body.context, LIMITS.context, true);
  if (context) request.context = context;
  return request;
}

function rawChoice(value: Record<string, unknown>, prefix: string): ChoiceQuestion {
  if (value.kind !== 'choice') badOutput();
  if (!Array.isArray(value.options) || value.options.length !== 4) badOutput();
  if (typeof value.answerIndex !== 'number' || !Number.isSafeInteger(value.answerIndex) || value.answerIndex < 0 || value.answerIndex > 3) badOutput();
  const options = value.options.map((option, index) => ({
    id: `${prefix}-o${index}`,
    label: text(option, '选项', 120, false)
  }));
  return {
    kind: 'choice',
    id: prefix,
    prompt: text(value.prompt, '题目', 400, false),
    options,
    answerId: `${prefix}-o${value.answerIndex}`,
    explanation: text(value.explanation, '解析', 600, false)
  };
}

function rawTranslate(value: Record<string, unknown>, prefix: string): Question {
  if (value.kind !== 'translate') badOutput();
  const keyPoints = Array.isArray(value.keyPoints)
    ? value.keyPoints.slice(0, 8).map(point => text(point, '要点', 80, false))
    : undefined;
  return {
    kind: 'translate',
    id: prefix,
    prompt: text(value.prompt, '题目', 400, false),
    reference: text(value.reference, '参考译文', 600, false),
    ...(keyPoints && keyPoints.length ? { keyPoints } : {})
  };
}

function rawQuestion(value: unknown, prefix: string, allowTranslate: boolean): Question {
  if (!value || typeof value !== 'object') badOutput();
  const record = value as Record<string, unknown>;
  if (record.kind === 'choice') return rawChoice(record, prefix);
  if (record.kind === 'translate' && allowTranslate) return rawTranslate(record, prefix);
  return badOutput();
}

/** Validates the model output and replaces all ids with deterministic ones. */
export function normalizeCourse(value: unknown, prefix: string): GeneratedCourse {
  if (!value || typeof value !== 'object') badOutput();
  const raw = value as Partial<RawCourse>;

  const words: WordItem[] = [];
  if (!Array.isArray(raw.words) || raw.words.length < 3 || raw.words.length > LIMITS.words) badOutput();
  raw.words.forEach((word, index) => {
    if (!word || typeof word !== 'object') badOutput();
    const item = word as Record<string, unknown>;
    if (!Array.isArray(item.meanings) || item.meanings.length < 1 || item.meanings.length > 4) badOutput();
    words.push({
      id: `${prefix}-w${index + 1}`,
      term: text(item.term, '单词', 40, false),
      phonetic: optionalText(item.phonetic, 60, false),
      meanings: item.meanings.map(meaning => text(meaning, '释义', 80, false)),
      example: text(item.example, '例句', 300, false),
      exampleTranslation: text(item.exampleTranslation, '例句翻译', 300, false)
    });
  });

  const grammar = raw.grammar;
  if (!grammar || typeof grammar !== 'object' || !Array.isArray(grammar.sections) || grammar.sections.length < 1 || grammar.sections.length > LIMITS.sections) badOutput();
  if (!Array.isArray(grammar.questions) || grammar.questions.length < 2 || grammar.questions.length > LIMITS.questions) badOutput();
  const grammarSections = grammar.sections.map(section => {
    if (!section || typeof section !== 'object') badOutput();
    const item = section as Record<string, unknown>;
    return { title: text(item.title, '语法标题', 60, false), body: text(item.body, '语法讲解', 600, false) };
  });
  const grammarQuestions = grammar.questions.map((question, index) => {
    const normalized = rawQuestion(question, `${prefix}-gq${index + 1}`, false);
    if (normalized.kind !== 'choice') badOutput();
    return normalized;
  });

  const reading = raw.reading;
  if (!reading || typeof reading !== 'object' || !Array.isArray(reading.questions)) badOutput();
  if (reading.questions.length < 1 || reading.questions.length > LIMITS.questions) badOutput();
  const readingQuestions = reading.questions.map((question, index) =>
    rawQuestion(question, `${prefix}-rq${index + 1}`, true));

  const review = raw.review;
  if (!review || typeof review !== 'object' || !Array.isArray(review.questions) || !Array.isArray(review.knowledgeLabels)) badOutput();
  if (review.questions.length < 1 || review.questions.length > LIMITS.questions) badOutput();
  if (review.knowledgeLabels.length < 1 || review.knowledgeLabels.length > LIMITS.words) badOutput();
  const reviewQuestions = review.questions.map((question, index) =>
    rawQuestion(question, `${prefix}-vq${index + 1}`, true));

  return {
    title: text(raw.title, 'title', LIMITS.title, false),
    topic: text(raw.topic, 'topic', LIMITS.topic, false),
    goal: text(raw.goal, 'goal', LIMITS.goal, false),
    level: optionalText(raw.level, LIMITS.level, false),
    words,
    grammarSections,
    grammarQuestions,
    passage: text(reading.passage, '短文', 4000, false),
    passageTranslation: optionalText(reading.passageTranslation, 4000, false),
    readingQuestions,
    knowledgeLabels: review.knowledgeLabels.map(label => text(label, '知识点', 80, false)),
    reviewQuestions
  };
}

export function normalizeGrade(value: unknown): GradeResult {
  if (!value || typeof value !== 'object') badOutput();
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (status !== 'correct' && status !== 'partial' && status !== 'uncertain') badOutput();
  return { status, feedback: text(record.feedback, '批改说明', LIMITS.feedback, false) };
}

export function normalizeTutor(value: unknown): TutorAnswer {
  if (!value || typeof value !== 'object') badOutput();
  const record = value as Record<string, unknown>;
  return { answer: text(record.answer, '回答', 4000, false) };
}
