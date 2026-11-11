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
    phrases: [
      { phrase: 'practise speaking English', meaning: '练习说英语' },
      { phrase: 'keep a habit', meaning: '保持习惯' },
      { phrase: 'write down new words', meaning: '记下新词' },
      { phrase: 'listen to a podcast', meaning: '听播客' },
      { phrase: 'make progress', meaning: '取得进步' }
    ],
    grammarSections: [
      {
        title: '一般现在时',
        body: '一般现在时表示习惯、规律和事实。主语是第三人称单数时，动词要加 -s 或 -es（She practices every day.）。否定句用 do not / does not 加动词原形，不能用 -s。常见错误是在 does not 后面仍然加 -s。',
        examples: [
          { en: 'She practices English every morning.', zh: '她每天早上练英语。' },
          { en: 'She does not practise on Sundays.', zh: '她周日不练习。' }
        ]
      },
      {
        title: '频率副词',
        body: '频率副词表示做某事的频繁程度。它们放在实义动词之前，放在 be 动词之后（I always review. / She is often tired.）。不要放在句末，也不要和 am/is/are 混在一起。',
        examples: [
          { en: 'I always review my notes.', zh: '我总是复习笔记。' },
          { en: 'She is often tired after work.', zh: '她下班后常常很累。' }
        ]
      }
    ],
    grammarQuestions: [
      { kind: 'choice', prompt: 'She ___ English every morning.', options: ['practice', 'practices', 'practicing', 'practiced'], answerIndex: 1, explanation: '主语 she 是第三人称单数，动词加 -s。', knowledge: 0 },
      { kind: 'choice', prompt: 'He doesn’t ___ time for TV.', options: ['has', 'have', 'having', 'had'], answerIndex: 1, explanation: 'doesn’t 后用动词原形。', knowledge: 0 },
      { kind: 'choice', prompt: 'I ___ review my notes before class.', options: ['always', 'am always', 'always am', 'review always'], answerIndex: 0, explanation: '频率副词放在实义动词前。', knowledge: 1 },
      { kind: 'choice', prompt: 'They ___ study on Sundays.', options: ['don’t', 'doesn’t', 'aren’t', 'not'], answerIndex: 0, explanation: '复数主语用 don’t 加动词原形。', knowledge: 0 },
      { kind: 'choice', prompt: 'She ___ late for class.', options: ['never is', 'is never', 'never be', 'be never'], answerIndex: 1, explanation: '频率副词放在 be 动词之后。', knowledge: 1 }
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
        kind: 'choice',
        prompt: 'How long does Mia practise English every morning?',
        options: ['Five minutes.', 'Ten minutes.', 'Twenty minutes.', 'One hour.'],
        answerIndex: 2,
        explanation: '第一句写明 twenty minutes。',
        knowledge: 2
      },
      {
        kind: 'choice',
        prompt: 'What does she do while walking to work?',
        options: ['She reads a book.', 'She listens to a podcast.', 'She writes emails.', 'She calls her teacher.'],
        answerIndex: 1,
        explanation: '文中说走路去上班时听播客。',
        knowledge: 2
      },
      {
        kind: 'choice',
        prompt: 'What does her teacher say about progress?',
        options: ['It comes from long nights.', 'It comes from small steps.', 'It comes from tests.', 'It comes from travel.'],
        answerIndex: 1,
        explanation: '老师说进步来自小步积累。',
        knowledge: 2
      },
      {
        kind: 'choice',
        prompt: 'Which sentence is true about Mia?',
        options: ['She studies for long hours.', 'She keeps a steady habit.', 'She never reviews notes.', 'She skips English on busy days.'],
        answerIndex: 1,
        explanation: '文中强调她保持稳定习惯，而不是长时间学习。',
        knowledge: 2
      }
    ],
    knowledgeLabels: ['一般现在时第三人称单数', '频率副词的位置', '保持稳定的学习习惯'],
    reviewQuestions: [
      { kind: 'translate', variant: 'correct', prompt: '改正这个句子：She want to study English.', instruction: '改写为正确的英文句子：考查 want 后接 to do', reference: 'She wants to study English.', explanation: '主语 she 是第三人称单数，want 要加 -s。', knowledge: 0 },
      { kind: 'translate', variant: 'correct', prompt: '改正这个句子：He enjoys to play basketball.', instruction: '改写为正确的英文句子：考查 enjoy 后接 doing', reference: 'He enjoys playing basketball.', explanation: 'enjoy 后面接 doing。', knowledge: 0 },
      { kind: 'translate', variant: 'correct', prompt: '改正这个句子：I am good at speak English.', instruction: '改写为正确的英文句子：介词 at 后面接 doing', reference: 'I am good at speaking English.', explanation: '介词 at 后面接动词 -ing。', knowledge: 1 },
      { kind: 'translate', prompt: '把这句话译成中文：She practises English for twenty minutes every morning.', instruction: '注意 practise 是英式拼写，for 后接时间段', reference: '她每天早上练二十分钟英语。', keyPoints: ['practise 练习', 'for + 时间'], knowledge: 2 },
      { kind: 'translate', prompt: '把这句话译成中文：Progress comes from small steps.', instruction: '注意 progress 是不可数名词', reference: '进步来自小步积累。', keyPoints: ['progress 进步', 'come from 来自'], knowledge: 2 },
      { kind: 'translate', prompt: '把这句话译成英文：我想学习英语。', instruction: '要求：使用 want to do', reference: 'I want to study English.', keyPoints: ['want to do'], knowledge: 0 },
      { kind: 'translate', prompt: '把这句话译成英文：她喜欢读英语书。', instruction: '要求：使用 enjoy doing，注意第三人称单数', reference: 'She enjoys reading English books.', keyPoints: ['enjoy doing', '第三人称单数'], knowledge: 0 },
      { kind: 'translate', prompt: '把这句话译成英文：我擅长打篮球。', instruction: '要求：使用 be good at doing', reference: 'I am good at playing basketball.', keyPoints: ['be good at doing'], knowledge: 1 },
      { kind: 'translate', prompt: '把这句话译成英文：他经常在课前复习笔记。', instruction: '要求：频率副词放在实义动词之前', reference: 'He often reviews his notes before class.', keyPoints: ['频率副词位置', '第三人称单数'], knowledge: 1 },
      { kind: 'translate', prompt: '把这句话译成英文：如果明天下雨，我就待在家里学习。', instruction: '要求：同时使用主将从现（if 从句用一般现在时）', reference: 'If it rains tomorrow, I will stay at home and study.', keyPoints: ['主将从现', 'stay at home'], knowledge: 2 }
    ]
  };
}
