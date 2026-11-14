export type DateKey = string;
export type Timestamp = number;

export type CourseSource = 'sample' | 'ai' | 'import';
export type CourseStatus = 'not_started' | 'in_progress' | 'completed';

export type LevelKey = 'junior' | 'senior' | 'cet4' | 'cet6';
export type PlanUnitStatus = 'pending' | 'skipped' | 'done';

export interface PlanUnit {
  number: number;
  topic: string;
  grammar: string;
  vocabulary: string;
  goal: string;
  level?: string;
  status: PlanUnitStatus;
  courseId?: string;
}

export interface LearningPlan {
  startLevel: LevelKey;
  targetLevel: LevelKey;
  units: PlanUnit[];
  /** 用户指定的下一课；生成时优先用它 */
  currentNumber?: number;
  updatedAt: Timestamp;
}

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
  generatedBy?: 'mock' | 'live';
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
  /** 例句里的常用搭配，0-2 条 */
  examplePhrases?: PhraseItem[];
  note?: string;
}

export interface GlossaryItem {
  term: string;
  phonetic?: string;
  meaning: string;
}

export interface PhraseItem {
  phrase: string;
  meaning: string;
}

export interface GrammarExample {
  en: string;
  zh: string;
}

/** 典型错误对比：错句 → 正确句 + 一句原因 */
export interface GrammarTrap {
  wrong: string;
  right: string;
  note: string;
}

export interface GrammarSection {
  title: string;
  body: string;
  /** 一句话规则，≤24 字 */
  rule?: string;
  /** 结构公式，如「主语 + have/has + 过去分词」 */
  pattern?: string;
  /** 判断信号词，如「since / for / already」 */
  signal?: string;
  trap?: GrammarTrap;
  examples?: GrammarExample[];
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
  /** 语法题所属规则卡下标，用于答错后回看 */
  sectionIndex?: number;
  knowledgeIds?: string[];
  /** Only present in AI payloads; mapped to knowledgeIds before saving. */
  knowledgeIndex?: number;
}

export interface FillQuestion {
  kind: 'fill';
  id: string;
  prompt: string;
  answers: string[];
  explanation: string;
  knowledgeIds?: string[];
  knowledgeIndex?: number;
}

export interface TranslateQuestion {
  kind: 'translate';
  id: string;
  prompt: string;
  reference: string;
  keyPoints?: string[];
  /** correct：改写/改错题，输入与反馈文案不同 */
  variant?: 'translate' | 'correct';
  /** 题干下的要求或注意点，例如“要求：使用 enjoy” */
  instruction?: string;
  explanation?: string;
  knowledgeIds?: string[];
  knowledgeIndex?: number;
}

export interface ModuleContentMap {
  word: { words: WordItem[]; phrases?: PhraseItem[] };
  grammar: { sections: GrammarSection[]; questions: ChoiceQuestion[] };
  reading: { passage: string; passageTranslation?: string; glossary?: GlossaryItem[]; questions: Question[] };
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
  correctDayStreak?: number;
  lastCorrectDate?: DateKey;
  source?: 'sample' | 'ai' | 'import';
  confirmed?: boolean;
  reviewReason?: string;
  lastSeenDate?: DateKey;
  nextReviewDate?: DateKey;
  updatedAt: Timestamp;
}

export type WordReviewStatus = 'known' | 'fuzzy' | 'unknown';

export interface WordReview {
  /** w:<normalized term>，同一个词跨课程共用一条记录 */
  id: string;
  term: string;
  phonetic?: string;
  meanings?: string[];
  example?: string;
  exampleTranslation?: string;
  /** 例句里的常用搭配，来自评级时保存的快照 */
  examplePhrases?: PhraseItem[];
  status: WordReviewStatus;
  /** 当前番茄间隔（天），0 表示还没记住 */
  intervalDays: number;
  /** 到期时间戳，早于等于当前时间即可复习 */
  dueAt: Timestamp;
  /** 连续答对次数 */
  streak: number;
  /** 遗忘次数 */
  lapses: number;
  /** 第一次评级的时间，用于每日新词配额 */
  firstSeenAt: Timestamp;
  lastReviewedAt: Timestamp;
  /** 最近一次出现在哪节课，用于“看原文” */
  courseId?: string;
  moduleId?: string;
  wordId?: string;
  updatedAt: Timestamp;
}

export interface HistoryDay {
  id: string;
  dayNumber: number;
  topic: string;
  source: string;
  evidence: 'studied' | 'listed_only';
  answerCount: number;
  confirmed: boolean;
  createdAt: Timestamp;
}

export interface PendingAiGrade {
  id: string;
  courseId: string;
  moduleId: string;
  questionId: string;
  prompt: string;
  reference: string;
  answer: string;
  keyPoints?: string[];
  knowledgeIds?: string[];
  status: 'pending' | 'failed';
  createdAt: Timestamp;
  error?: string;
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
  /** 错题练习里连续答对的次数，达到 2 次就不再出题 */
  drillCorrectStreak?: number;
  /** 最近一次参与错题练习的日期 */
  lastDrillDate?: DateKey;
  /** 累计在错题练习里答错的次数，用于选题权重 */
  drillWrongCount?: number;
  /** 已巩固，不再进入每日练习，但保留记录 */
  drillMasteredAt?: Timestamp;
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

export type AiCallKind = 'generate' | 'grade' | 'tutor' | 'drill' | 'plan';
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
  /** 每个模块最后停留的位置，用于点进模块时接着学 */
  modulePositions?: Record<string, { wordId?: string; questionId?: string }>;
  /** 单词自动朗读开关 */
  autoSpeakWord?: boolean;
  /** 当天的错题练习计划 */
  drillPlan?: { dateKey: string; mistakeIds: string[]; answeredIds: string[] };
  /** 学习路线：等级 → 目标 + 已规划课程 */
  learningPlan?: LearningPlan;
  /** 用户手动设为当前课程的课程 id */
  currentCourseId?: string;
  aiAccessToken?: string;
  knowledgeUnifiedAt?: Timestamp;
  wordReviewsMigratedAt?: Timestamp;
  samplesSeededAt?: Timestamp;
  historyImportedAt?: Timestamp;
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
  historyDays: HistoryDay[];
  pendingAi: PendingAiGrade[];
  wordReviews: WordReview[];
  settings: AppSettings[];
}

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  data: BackupData;
}
