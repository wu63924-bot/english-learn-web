import type { ChoiceQuestion, GrammarSection, GlossaryItem, PhraseItem, Question, WordItem } from '../src/types/domain.ts';

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

export interface DrillRequest {
  label: string;
  context?: string;
}

export interface Drill {
  prompt: string;
  options: { id: string; label: string }[];
  answerId: string;
  explanation: string;
}

export interface GeneratedCourse {
  title: string;
  topic: string;
  goal: string;
  level?: string;
  words: WordItem[];
  phrases?: PhraseItem[];
  grammarSections: GrammarSection[];
  grammarQuestions: ChoiceQuestion[];
  passage: string;
  passageTranslation?: string;
  passageGlossary?: GlossaryItem[];
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
  knowledge?: number;
}

export interface RawTranslateQuestion {
  kind: 'translate';
  prompt: string;
  reference: string;
  keyPoints?: string[];
  variant?: 'translate' | 'correct';
  instruction?: string;
  explanation?: string;
  knowledge?: number;
}

export type RawQuestion = RawChoiceQuestion | RawTranslateQuestion;

export interface RawCourse {
  title: string;
  topic: string;
  goal: string;
  level?: string;
  words: { term: string; phonetic?: string; meanings: string[]; example: string; exampleTranslation: string; examplePhrases?: { phrase: string; meaning: string }[] }[];
  phrases?: { phrase: string; meaning: string }[];
  grammarSections: { title: string; body: string; examples?: { en: string; zh: string }[] }[];
  grammarQuestions: RawQuestion[];
  passage: string;
  passageTranslation?: string;
  passageGlossary?: { term: string; phonetic?: string; meaning: string }[];
  readingQuestions: RawQuestion[];
  knowledgeLabels: string[];
  reviewQuestions: RawQuestion[];
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
  generateDrill(request: DrillRequest, signal?: AbortSignal): Promise<ProviderResult<Drill>>;
}
