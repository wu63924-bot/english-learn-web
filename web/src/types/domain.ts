export type DateKey = string;
export type Timestamp = number;

export type CourseSource = 'sample' | 'ai' | 'import';
export type CourseStatus = 'not_started' | 'in_progress' | 'completed';

export type ModuleKind = 'word' | 'grammar' | 'reading' | 'review';
export type ModuleStatus = 'todo' | 'draft' | 'answered' | 'graded';

export interface Course {
  id: string;
  number: number;
  title: string;
  topic: string;
  goal: string;
  level?: string;
  source: CourseSource;
  status: CourseStatus;
  startedDate?: DateKey;
  completedDate?: DateKey;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface WordItem {
  id: string;
  term: string;
  phonetic?: string;
  meanings: string[];
  example: string;
  exampleTranslation: string;
  note?: string;
}

export interface GrammarSection {
  title: string;
  body: string;
}

export type Question =
  | ChoiceQuestion
  | FillQuestion
  | TranslateQuestion;

export interface ChoiceQuestion {
  kind: 'choice';
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  answerId: string;
  explanation: string;
}

export interface FillQuestion {
  kind: 'fill';
  id: string;
  prompt: string;
  answers: string[];
  explanation: string;
}

export interface TranslateQuestion {
  kind: 'translate';
  id: string;
  prompt: string;
  reference: string;
  keyPoints?: string[];
}

export interface ModuleContentMap {
  word: { words: WordItem[] };
  grammar: { sections: GrammarSection[]; questions: ChoiceQuestion[] };
  reading: { passage: string; passageTranslation?: string; questions: Question[] };
  review: { knowledgeIds: string[]; questions: Question[] };
}

export interface CourseModule<K extends ModuleKind = ModuleKind> {
  id: string;
  courseId: string;
  kind: K;
  order: number;
  status: ModuleStatus;
  content: ModuleContentMap[K];
}

export type GradeStatus = 'correct' | 'incorrect' | 'partial' | 'uncertain';
export type GradeSource = 'local' | 'ai';

export interface Grade {
  id: string;
  answerId: string;
  status: GradeStatus;
  source: GradeSource;
  score?: number;
  feedback?: string;
  gradedAt: Timestamp;
  knowledgeIds: string[];
}

/** Deterministic id: course + module + question. Re-saving overwrites instead of duplicating. */
export interface AnswerRecord {
  id: string;
  courseId: string;
  moduleId: string;
  questionId: string;
  questionKind: Question['kind'];
  value: string | null;
  dateKey: DateKey;
  updatedAt: Timestamp;
}

export type KnowledgeKind = 'word' | 'grammar' | 'pattern';
export type KnowledgeStatus = 'unseen' | 'learning' | 'needs_review' | 'mastered';

export interface KnowledgePoint {
  id: string;
  label: string;
  kind: KnowledgeKind;
  stage: number;
  status: KnowledgeStatus;
  correctStreak: number;
  wrongStreak: number;
  lastSeenDate?: DateKey;
  nextReviewDate?: DateKey;
  updatedAt: Timestamp;
}

export type ReviewState = 'pending' | 'done';

export interface ReviewItem {
  id: string;
  knowledgeId: string;
  dueDate: DateKey;
  reason: string;
  state: ReviewState;
  createdAt: Timestamp;
}

export interface Mistake {
  id: string;
  courseId: string;
  moduleId: string;
  questionId: string;
  knowledgeId?: string;
  wrongValue: string;
  reason: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StudyDay {
  dateKey: DateKey;
  seconds: number;
  coursesCompleted: number;
  modulesCompleted: number;
  firstActiveAt: Timestamp;
  lastActiveAt: Timestamp;
}

export type AiCallKind = 'generate' | 'grade' | 'tutor';
export type AiCallStatus = 'ok' | 'error' | 'timeout' | 'rejected';

export interface AiUsageRecord {
  id: string;
  dateKey: DateKey;
  kind: AiCallKind;
  model: string;
  tokensIn: number;
  tokensOut: number;
  status: AiCallStatus;
  costEstimate?: number;
  createdAt: Timestamp;
}

export interface AppSettings {
  id: 'app';
  appVersion: string;
  dailyGoalMinutes?: number;
  aiDailyBudget?: number;
  updatedAt: Timestamp;
}

export interface BackupData {
  courses: Course[];
  courseModules: CourseModule[];
  answers: AnswerRecord[];
  grades: Grade[];
  knowledge: KnowledgePoint[];
  reviews: ReviewItem[];
  mistakes: Mistake[];
  studyDays: StudyDay[];
  aiUsage: AiUsageRecord[];
  settings: AppSettings[];
}

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  data: BackupData;
}
