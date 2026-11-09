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
  ProviderResult,
  RawCourse,
  TutorAnswer,
  TutorRequest
} from './provider.ts';
import { normalizeCourse, normalizeDrill, normalizeGrade, normalizeTutor } from './schema.ts';

/** Deterministic provider used for tests and offline development. No network, no cost. */
export class MockProvider implements AiProvider {
  private readonly config: Pick<ApiConfig, 'mockLatencyMs'>;

  constructor(config: Pick<ApiConfig, 'mockLatencyMs'>) {
    this.config = config;
  }

  async generateCourse(request: GenerateCourseRequest, signal?: AbortSignal): Promise<ProviderResult<GeneratedCourse>> {
    await delay(this.config.mockLatencyMs, signal);
    return { data: normalizeCourse(buildRawCourse(request), `ai-${request.number}`), usage: { inputTokens: 0, outputTokens: 0 } };
  }

  async grade(request: GradeRequest, signal?: AbortSignal): Promise<ProviderResult<GradeResult>> {
    await delay(this.config.mockLatencyMs, signal);
    return { data: normalizeGrade(mockGrade(request)), usage: { inputTokens: 0, outputTokens: 0 } };
  }

  async tutor(request: TutorRequest, signal?: AbortSignal): Promise<ProviderResult<TutorAnswer>> {
    await delay(this.config.mockLatencyMs, signal);
    const answer = `（模拟回答）你问的是「${request.question}」。当前为模拟模式，未调用真实模型；接入真实服务后会结合本课内容回答。`;
    return { data: normalizeTutor({ answer }), usage: { inputTokens: 0, outputTokens: 0 } };
  }

  async generateDrill(request: DrillRequest, signal?: AbortSignal): Promise<ProviderResult<Drill>> {
    await delay(this.config.mockLatencyMs, signal);
    const drill = normalizeDrill({
      prompt: 'She ___ English every day.',
      options: ['practice', 'practices', 'practicing', 'practiced'],
      answerIndex: 1,
      explanation: `第三人称单数用 practices（模拟题目，目标知识点：${request.label}）。`
    });
    return { data: drill, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('AI_TIMEOUT'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new ApiError('AI_TIMEOUT'));
    }, { once: true });
  });
}

function normalize(value: string): string {
  return value.normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase().replace(/[.!?。！？]+$/, '');
}

function mockGrade(request: GradeRequest): GradeResult {
  const expected = normalize(request.reference);
  const actual = normalize(request.answer);
  if (!actual) return { status: 'uncertain', feedback: '没有看到有效译文，无法判断。' };
  if (actual === expected) return { status: 'correct', feedback: '与参考译文一致（模拟批改）。' };
  const points = request.keyPoints ?? [];
  const hit = points.filter(point => {
    const key = point.split(/[\s：:，,。]+/).filter(Boolean)[0];
    return key ? actual.includes(normalize(key)) : false;
  }).length;
  if (points.length && hit / points.length >= 0.5) {
    return { status: 'partial', feedback: '覆盖了部分要点，仍有遗漏（模拟批改）。' };
  }
  return { status: 'uncertain', feedback: '模拟模式无法判断语义是否等价，请人工核对。' };
}

function buildRawCourse(request: GenerateCourseRequest): RawCourse {
  const topic = request.topic;
  return {
    title: `Mock Lesson: ${topic}`,
    topic,
    goal: request.goal ?? `围绕「${topic}」完成一次听说读写综合练习`,
    level: request.level ?? 'B1',
    words: [
      {
        term: 'habit',
        phonetic: '/ˈhæbɪt/',
        meanings: ['n. 习惯'],
        example: 'Reading for ten minutes a day is a good habit.',
        exampleTranslation: '每天读十分钟是个好习惯。'
      },
      {
        term: 'progress',
        phonetic: '/ˈprɑːɡres/',
        meanings: ['n. 进步', 'v. 前进'],
        example: 'She made steady progress in speaking.',
        exampleTranslation: '她的口语稳步进步。'
      },
      {
        term: 'review',
        phonetic: '/rɪˈvjuː/',
        meanings: ['v. 复习', 'n. 回顾'],
        example: 'Review yesterday’s notes before the next lesson.',
        exampleTranslation: '下节课前复习昨天的笔记。'
      },
      {
        term: 'focus',
        phonetic: '/ˈfoʊkəs/',
        meanings: ['v. 集中注意力', 'n. 重点'],
        example: 'Focus on one grammar point at a time.',
        exampleTranslation: '一次专注一个语法点。'
      },
      {
        term: 'spare',
        phonetic: '/sper/',
        meanings: ['adj. 空闲的'],
        example: 'Use your spare time to listen to English.',
        exampleTranslation: '用空闲时间听英语。'
      }
    ],
    grammarSections: [
      { title: '一般现在时', body: '表示习惯和规律。第三人称单数动词加 -s：She practices every day。' },
      { title: '频率副词', body: 'always、usually、often、sometimes、never 放在实义动词之前、be 动词之后。' }
    ],
    grammarQuestions: [
      { kind: 'choice', prompt: 'She ___ English every morning.', options: ['practice', 'practices', 'practicing', 'practiced'], answerIndex: 1, explanation: '主语 she 是第三人称单数，动词加 -s。', knowledge: 0 },
      { kind: 'choice', prompt: 'He doesn’t ___ time for TV.', options: ['has', 'have', 'having', 'had'], answerIndex: 1, explanation: 'doesn’t 后用动词原形。', knowledge: 0 },
      { kind: 'choice', prompt: 'I ___ review my notes before class.', options: ['always', 'am always', 'always am', 'review always'], answerIndex: 0, explanation: '频率副词放在实义动词前。', knowledge: 1 },
      { kind: 'choice', prompt: 'They ___ study on Sundays.', options: ['don’t', 'doesn’t', 'aren’t', 'not'], answerIndex: 0, explanation: '复数主语用 don’t 加动词原形。', knowledge: 0 }
    ],
    passage: 'Mia practices English for twenty minutes every morning. She usually reads a short article and writes down three new words. Before class, she reviews her notes for five minutes. She does not study for long hours; instead, she keeps a steady habit. On busy days, she listens to a podcast while walking to work. Her teacher says progress comes from small steps, not from one long night of study.',
    passageTranslation: '米娅每天早上练二十分钟英语。她通常读一篇短文，记下三个新词。上课前，她用五分钟复习笔记。她不会长时间学习，而是保持稳定的习惯。忙碌的日子里，她走路去上班时听播客。老师说，进步来自小步积累，而不是熬一个长夜。',
    readingQuestions: [
      {
        kind: 'choice',
        prompt: 'What does Mia usually do in the morning?',
        options: ['She writes three articles.', 'She reads and notes new words.', 'She goes to class.', 'She sleeps longer.'],
        answerIndex: 1,
        explanation: '文中说她读一篇短文并记下三个新词。',
        knowledge: 2
      },
      {
        kind: 'translate',
        prompt: '把这句话译成中文：Progress comes from small steps, not from one long night of study.',
        reference: '进步来自小步积累，而不是熬一个长夜学习。',
        keyPoints: ['progress 进步', 'small steps 小步', 'not from 而不是'],
        knowledge: 2
      }
    ],
    knowledgeLabels: ['一般现在时第三人称单数', '频率副词的位置', '保持稳定的学习习惯'],
    reviewQuestions: [
      { kind: 'choice', prompt: 'She ___ a podcast every day.', options: ['listen', 'listens', 'listening', 'listened'], answerIndex: 1, explanation: '第三人称单数用 listens。', knowledge: 0 },
      { kind: 'choice', prompt: 'We ___ study for long hours.', options: ['don’t', 'doesn’t', 'aren’t', 'not'], answerIndex: 0, explanation: '复数主语用 don’t。', knowledge: 0 }
    ]
  };
}
