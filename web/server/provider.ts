import type { ChoiceQuestion, GrammarSection, Question, WordItem } from '../src/types/domain.ts';

export interface GenerateCourseRequest {
  number: number;
  topic: string;
  focus?: string;
  level?: string;
  goal?: string;
}

export interface GradeRequest {
  prompt: string;
  reference: string;
  answer: string;
  keyPoints?: string[];
}

export interface TutorRequest {
  question: string;
  context?: string;
}

export interface GeneratedCourse {
  title: string;
  topic: string;
  goal: string;
  level?: string;
  words: WordItem[];
  grammarSections: GrammarSection[];
  grammarQuestions: ChoiceQuestion[];
  passage: string;
  passageTranslation?: string;
  readingQuestions: Question[];
  knowledgeLabels: string[];
  reviewQuestions: Question[];
}

export type GradeStatus = 'correct' | 'partial' | 'uncertain';

export interface GradeResult {
  status: GradeStatus;
  feedback: string;
}

export interface TutorAnswer {
  answer: string;
}

export interface RawChoiceQuestion {
  kind: 'choice';
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface RawTranslateQuestion {
  kind: 'translate';
  prompt: string;
  reference: string;
  keyPoints?: string[];
}

export type RawQuestion = RawChoiceQuestion | RawTranslateQuestion;

export interface RawCourse {
  title: string;
  topic: string;
  goal: string;
  level?: string;
  words: { term: string; phonetic?: string; meanings: string[]; example: string; exampleTranslation: string }[];
  grammar: { sections: { title: string; body: string }[]; questions: RawQuestion[] };
  reading: { passage: string; passageTranslation?: string; questions: RawQuestion[] };
  review: { knowledgeLabels: string[]; questions: RawQuestion[] };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderResult<T> {
  data: T;
  usage: TokenUsage;
}

export interface AiProvider {
  generateCourse(request: GenerateCourseRequest, signal?: AbortSignal): Promise<ProviderResult<GeneratedCourse>>;
  grade(request: GradeRequest, signal?: AbortSignal): Promise<ProviderResult<GradeResult>>;
  tutor(request: TutorRequest, signal?: AbortSignal): Promise<ProviderResult<TutorAnswer>>;
}
