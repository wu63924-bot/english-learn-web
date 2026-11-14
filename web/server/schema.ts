import { ApiError } from './errors.ts';
import type {
  Drill,
  DrillRequest,
  GeneratedCourse,
  GenerateCourseRequest,
  GradeRequest,
  GradeResult,
  PlanLevel,
  PlanRequest,
  PlanResult,
  RawCourse,
  TutorAnswer,
  TutorRequest
} from './provider.ts';
import type { ChoiceQuestion, PhraseItem, Question, WordItem } from '../src/types/domain.ts';

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
  words: 20,
  sections: 4,
  questions: 10
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

const PLAN_LEVELS: PlanLevel[] = ['junior', 'senior', 'cet4', 'cet6'];
const PLAN_COUNT = 10;

function planLevel(value: unknown): PlanLevel {
  if (typeof value !== 'string' || !PLAN_LEVELS.includes(value as PlanLevel)) fail('等级必须是 junior / senior / cet4 / cet6');
  return value as PlanLevel;
}

export function parsePlanRequest(value: unknown): PlanRequest {
  if (!value || typeof value !== 'object') fail('请求体必须是对象');
  const body = value as Record<string, unknown>;
  const learned = Array.isArray(body.learned)
    ? body.learned.slice(0, 60).map(item => text(item, '已学主题', 80, true))
    : [];
  return {
    startNumber: integer(body.startNumber, 1, 999, 'startNumber'),
    startLevel: planLevel(body.startLevel),
    targetLevel: planLevel(body.targetLevel),
    count: PLAN_COUNT,
    learned
  };
}

/** 校验 10 课大纲；少一条就整体拒绝，避免路线缺课。 */
export function normalizePlan(value: unknown, count = PLAN_COUNT): PlanResult {
  if (!value || typeof value !== 'object') badOutput();
  const raw = value as Record<string, unknown>;
  const units = raw.units;
  if (!Array.isArray(units) || units.length !== count) badOutput();
  return {
    units: units.map(unit => {
      if (!unit || typeof unit !== 'object') badOutput();
      const item = unit as Record<string, unknown>;
      return {
        topic: text(item.topic, '主题', 80, false),
        grammar: text(item.grammar, '语法点', 60, false),
        vocabulary: text(item.vocabulary, '词汇方向', 60, false),
        goal: text(item.goal, '目标', 120, false),
        level: optionalText(item.level, LIMITS.level, false)
      };
    })
  };
}

function rawChoice(value: Record<string, unknown>, prefix: string, withSection = false): ChoiceQuestion {
  if (value.kind !== 'choice') badOutput();
  if (!Array.isArray(value.options) || value.options.length !== 4) badOutput();
  if (typeof value.answerIndex !== 'number' || !Number.isSafeInteger(value.answerIndex) || value.answerIndex < 0 || value.answerIndex > 3) badOutput();
  const options = value.options.map((option, index) => ({
    id: `${prefix}-o${index}`,
    label: text(option, '选项', 120, false)
  }));
  const knowledge = typeof value.knowledge === 'number' && Number.isSafeInteger(value.knowledge) && value.knowledge >= 0
    ? value.knowledge
    : undefined;
  const section = withSection && typeof value.section === 'number' && Number.isSafeInteger(value.section) && value.section >= 0
    ? value.section
    : undefined;
  return {
    kind: 'choice',
    id: prefix,
    prompt: text(value.prompt, '题目', 400, false),
    options,
    answerId: `${prefix}-o${value.answerIndex}`,
    explanation: text(value.explanation, '解析', 600, false),
    ...(section === undefined ? {} : { sectionIndex: section }),
    ...(knowledge === undefined ? {} : { knowledgeIndex: knowledge })
  };
}

function rawTranslate(value: Record<string, unknown>, prefix: string): Question {
  if (value.kind !== 'translate') badOutput();
  const keyPoints = Array.isArray(value.keyPoints)
    ? value.keyPoints.slice(0, 8).map(point => text(point, '要点', 80, false))
    : undefined;
  const knowledge = typeof value.knowledge === 'number' && Number.isSafeInteger(value.knowledge) && value.knowledge >= 0
    ? value.knowledge
    : undefined;
  const variant = value.variant === 'correct' ? 'correct' : undefined;
  const explanation = optionalText(value.explanation, 600, false);
  const instruction = optionalText(value.instruction, 200, false);
  return {
    kind: 'translate',
    id: prefix,
    prompt: text(value.prompt, '题目', 400, false),
    reference: text(value.reference, '参考译文', 600, false),
    ...(variant ? { variant } : {}),
    ...(instruction ? { instruction } : {}),
    ...(explanation ? { explanation } : {}),
    ...(knowledge === undefined ? {} : { knowledgeIndex: knowledge }),
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
    const examplePhrases = Array.isArray(item.examplePhrases)
      ? item.examplePhrases.slice(0, 3).map(entry => {
        if (!entry || typeof entry !== 'object') badOutput();
        const phrase = entry as Record<string, unknown>;
        return { phrase: text(phrase.phrase, '例句搭配', 60, false), meaning: text(phrase.meaning, '搭配释义', 60, false) };
      })
      : undefined;
    words.push({
      id: `${prefix}-w${index + 1}`,
      term: text(item.term, '单词', 40, false),
      phonetic: optionalText(item.phonetic, 60, false),
      meanings: item.meanings.map(meaning => text(meaning, '释义', 80, false)),
      example: text(item.example, '例句', 300, false),
      exampleTranslation: text(item.exampleTranslation, '例句翻译', 300, false),
      ...(examplePhrases && examplePhrases.length ? { examplePhrases } : {})
    });
  });

  const phrasesRaw = raw.phrases;
  const phrases: PhraseItem[] = [];
  if (phrasesRaw !== undefined) {
    if (!Array.isArray(phrasesRaw) || phrasesRaw.length > 8) badOutput();
    for (const item of phrasesRaw) {
      if (!item || typeof item !== 'object') badOutput();
      const entry = item as Record<string, unknown>;
      phrases.push({
        phrase: text(entry.phrase, '短语', 100, false),
        meaning: text(entry.meaning, '短语释义', 100, false)
      });
    }
  }

  const grammarSectionsRaw = raw.grammarSections;
  if (!Array.isArray(grammarSectionsRaw) || grammarSectionsRaw.length < 1 || grammarSectionsRaw.length > LIMITS.sections) badOutput();
  if (!Array.isArray(raw.grammarQuestions) || raw.grammarQuestions.length !== 5) badOutput();
  const grammarSections = grammarSectionsRaw.map(section => {
    if (!section || typeof section !== 'object') badOutput();
    const item = section as Record<string, unknown>;
    const examples = Array.isArray(item.examples)
      ? item.examples.slice(0, 8).map(example => {
        if (!example || typeof example !== 'object') badOutput();
        const entry = example as Record<string, unknown>;
        return { en: text(entry.en, '例句', 300, false), zh: text(entry.zh, '例句翻译', 300, false) };
      })
      : undefined;
    const trapRaw = item.trap;
    let trap;
    if (trapRaw && typeof trapRaw === 'object') {
      const entry = trapRaw as Record<string, unknown>;
      if (entry.wrong !== undefined && entry.right !== undefined) {
        trap = {
          wrong: text(entry.wrong, '错句', 200, false),
          right: text(entry.right, '正确句', 200, false),
          note: optionalText(entry.note, 120, false) ?? ''
        };
      }
    }
    return {
      title: text(item.title, '语法标题', 60, false),
      body: text(item.body, '语法讲解', 1200, false),
      ...(optionalText(item.rule, 60, false) ? { rule: optionalText(item.rule, 60, false) } : {}),
      ...(optionalText(item.pattern, 120, false) ? { pattern: optionalText(item.pattern, 120, false) } : {}),
      ...(optionalText(item.signal, 80, false) ? { signal: optionalText(item.signal, 80, false) } : {}),
      ...(trap ? { trap } : {}),
      ...(examples && examples.length ? { examples } : {})
    };
  });
  const grammarQuestions = raw.grammarQuestions.map((question, index) => {
    const normalized = rawChoice(question as unknown as Record<string, unknown>, `${prefix}-gq${index + 1}`, true);
    if (normalized.sectionIndex !== undefined && normalized.sectionIndex >= grammarSections.length) {
      delete normalized.sectionIndex;
    }
    return normalized;
  });

  if (!Array.isArray(raw.readingQuestions)) badOutput();
  if (raw.readingQuestions.length !== 5) badOutput();
  const readingQuestions = raw.readingQuestions.map((question, index) =>
    rawQuestion(question, `${prefix}-rq${index + 1}`, true));
  const passageGlossary = Array.isArray(raw.passageGlossary)
    ? raw.passageGlossary.slice(0, 20).map(item => {
      if (!item || typeof item !== 'object') badOutput();
      const entry = item as Record<string, unknown>;
      return {
        term: text(entry.term, '生词', 40, false),
        ...(entry.phonetic === undefined ? {} : { phonetic: text(entry.phonetic, '音标', 60, false) }),
        meaning: text(entry.meaning, '生词释义', 80, false)
      };
    })
    : undefined;

  if (!Array.isArray(raw.reviewQuestions) || !Array.isArray(raw.knowledgeLabels)) badOutput();
  if (raw.reviewQuestions.length !== 10) badOutput();
  if (raw.knowledgeLabels.length < 1 || raw.knowledgeLabels.length > LIMITS.words) badOutput();
  const reviewQuestions = raw.reviewQuestions.map((question, index) =>
    rawQuestion(question, `${prefix}-vq${index + 1}`, true));
  const corrections = reviewQuestions.filter(question => question.kind === 'translate' && question.variant === 'correct');
  if (corrections.length !== 3) badOutput();
  const knowledgeLabels = raw.knowledgeLabels.map(label => text(label, '知识点', 80, false));
  for (const question of [...grammarQuestions, ...readingQuestions, ...reviewQuestions]) {
    if (question.knowledgeIndex !== undefined && question.knowledgeIndex >= knowledgeLabels.length) badOutput();
  }

  return {
    title: text(raw.title, 'title', LIMITS.title, false),
    topic: text(raw.topic, 'topic', LIMITS.topic, false),
    goal: text(raw.goal, 'goal', LIMITS.goal, false),
    level: optionalText(raw.level, LIMITS.level, false),
    words,
    ...(phrases.length ? { phrases } : {}),
    grammarSections,
    grammarQuestions,
    passage: text(raw.passage, '短文', 4000, false),
    passageTranslation: optionalText(raw.passageTranslation, 4000, false),
    ...(passageGlossary && passageGlossary.length ? { passageGlossary } : {}),
    readingQuestions,
    knowledgeLabels,
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

export function normalizeDrill(value: unknown): Drill {
  if (!value || typeof value !== 'object') badOutput();
  const record = value as Record<string, unknown>;
  const question = rawChoice({ ...record, kind: 'choice' }, 'drill');
  return {
    prompt: question.prompt,
    options: question.options,
    answerId: question.answerId,
    explanation: question.explanation
  };
}

export function parseDrillRequest(value: unknown): DrillRequest {
  if (!value || typeof value !== 'object') fail('请求体必须是对象');
  const body = value as Record<string, unknown>;
  const request: DrillRequest = { label: text(body.label, 'label', 80, true) };
  const context = optionalText(body.context, 1200, true);
  if (context) request.context = context;
  return request;
}
