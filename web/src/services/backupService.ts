import type { BackupFile, BackupData } from '../types/domain';
import { db } from '../db/db';
import { migrateWordReviews } from './wordReviewMigration';

export const BACKUP_APP = 'EnglishLearn';
export const BACKUP_VERSION = 5;
const SUPPORTED_VERSIONS = [1, 2, 3, 4, 5];

export async function createBackup(): Promise<BackupFile> {
  const [courses, courseModules, answers, grades, knowledge, reviews, mistakes, studyDays, aiUsage, historyDays, pendingAi, wordReviews, settings] = await Promise.all([
    db.courses.toArray(),
    db.courseModules.toArray(),
    db.answers.toArray(),
    db.grades.toArray(),
    db.knowledge.toArray(),
    db.reviews.toArray(),
    db.mistakes.toArray(),
    db.studyDays.toArray(),
    db.aiUsage.toArray(),
    db.historyDays.toArray(),
    db.pendingAi.toArray(),
    db.wordReviews.toArray(),
    db.settings.toArray().then(items => items.map(setting => {
      const clone = { ...setting };
      delete clone.aiAccessToken;
      return clone;
    }))
  ]);
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { courses, courseModules, answers, grades, knowledge, reviews, mistakes, studyDays, aiUsage, historyDays, pendingAi, wordReviews, settings }
  };
}

/**
 * Validates a backup file completely before anything touches the database.
 * Throws with a user-facing message when the file is damaged or unrelated.
 */
export function parseBackup(text: string): BackupFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (!isRecord(value)) throw new Error('备份内容格式不正确');
  if (value.app !== BACKUP_APP) throw new Error('这不是本应用的备份文件');
  if (typeof value.version !== 'number' || !SUPPORTED_VERSIONS.includes(value.version)) {
    throw new Error(`不支持的备份版本：${String(value.version)}`);
  }
  const version = value.version;
  if (!isRecord(value.data)) throw new Error('备份缺少数据段');

  const data = value.data;
  const courses = data.courses;
  const courseModules = data.courseModules;
  const answers = data.answers;
  const grades = data.grades;
  const knowledge = data.knowledge;
  const reviews = data.reviews;
  const mistakes = data.mistakes;
  const studyDays = data.studyDays;
  const aiUsage = data.aiUsage;
  const historyDays = version >= 2 ? data.historyDays : [];
  const pendingAi = version >= 3 ? data.pendingAi : [];
  const wordReviews = version >= 4 ? data.wordReviews : [];
  const settings = data.settings;

  if (!arrays(courses, isCourse) || !arrays(courseModules, isCourseModule) || !arrays(answers, isAnswer)
    || !arrays(grades, isGrade) || !arrays(knowledge, isKnowledge) || !arrays(reviews, isReview)
    || !arrays(mistakes, isMistake) || !arrays(studyDays, isStudyDay) || !arrays(aiUsage, isAiUsage)
    || !arrays(historyDays, isHistoryDay) || !arrays(pendingAi, isPendingAi)
    || !arrays(wordReviews, isWordReview)
    || !arrays(settings, isSettings) || !settings.some(item => item.id === 'app')) {
    throw new Error('备份内容不完整或字段格式不正确');
  }

  const courseIds = new Set(courses.map(item => item.id));
  if (!unique(courses, item => item.id) || !unique(courseModules, item => item.id) || !unique(answers, item => item.id)
    || !unique(grades, item => item.id) || !unique(knowledge, item => item.id) || !unique(reviews, item => item.id)
    || !unique(mistakes, item => item.id) || !unique(studyDays, item => item.dateKey) || !unique(aiUsage, item => item.id)
    || !unique(historyDays, item => item.id) || !unique(pendingAi, item => item.id) || !unique(wordReviews, item => item.id) || !unique(settings, item => item.id)) {
    throw new Error('备份中存在重复的数据标识');
  }

  if (courseModules.some(item => !courseIds.has(item.courseId))
    || answers.some(item => !courseIds.has(item.courseId))
    || mistakes.some(item => !courseIds.has(item.courseId))
    || grades.some(grade => !answers.some(answer => answer.id === grade.answerId))
    || reviews.some(review => !knowledge.some(point => point.id === review.knowledgeId))) {
    throw new Error('备份中的数据引用不完整');
  }

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    data: { courses, courseModules, answers, grades, knowledge, reviews, mistakes, studyDays, aiUsage, historyDays, pendingAi, wordReviews, settings }
  };
}

/** Replaces every table in one transaction; a failure leaves the previous data untouched. */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const data = backup.data;
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
    if (data.courses.length) await db.courses.bulkPut(data.courses);
    if (data.courseModules.length) await db.courseModules.bulkPut(data.courseModules);
    if (data.answers.length) await db.answers.bulkPut(data.answers);
    if (data.grades.length) await db.grades.bulkPut(data.grades);
    if (data.knowledge.length) await db.knowledge.bulkPut(data.knowledge);
    if (data.reviews.length) await db.reviews.bulkPut(data.reviews);
    if (data.mistakes.length) await db.mistakes.bulkPut(data.mistakes);
    if (data.studyDays.length) await db.studyDays.bulkPut(data.studyDays);
    if (data.aiUsage.length) await db.aiUsage.bulkPut(data.aiUsage);
    if (data.historyDays.length) await db.historyDays.bulkPut(data.historyDays);
    if (data.pendingAi.length) await db.pendingAi.bulkPut(data.pendingAi);
    if (data.wordReviews.length) await db.wordReviews.bulkPut(data.wordReviews);
    await db.settings.bulkPut(data.settings.map(setting => {
      const clone = { ...setting };
      // 旧备份里的单词记录是课程维度，导入后交给迁移重新合并。
      delete clone.wordReviewsMigratedAt;
      return clone;
    }));
  });
  await migrateWordReviews();
}

export function backupCounts(backup: BackupFile): { courses: number; answers: number; mistakes: number; studyDays: number; historyDays: number } {
  return {
    courses: backup.data.courses.length,
    answers: backup.data.answers.length,
    mistakes: backup.data.mistakes.length,
    studyDays: backup.data.studyDays.length,
    historyDays: backup.data.historyDays.length
  };
}

const COURSE_SOURCES = ['sample', 'ai', 'import'];
const COURSE_STATUSES = ['not_started', 'in_progress', 'completed'];
const MODULE_KINDS = ['word', 'grammar', 'reading', 'review'];
const MODULE_STATUSES = ['todo', 'draft', 'answered', 'graded'];
const QUESTION_KINDS = ['choice', 'fill', 'translate'];
const GRADE_STATUSES = ['correct', 'incorrect', 'partial', 'uncertain'];
const GRADE_SOURCES = ['local', 'ai'];
const KNOWLEDGE_KINDS = ['word', 'grammar', 'pattern'];
const KNOWLEDGE_STATUSES = ['unseen', 'learning', 'needs_review', 'mastered'];
const REVIEW_STATES = ['pending', 'done'];
const AI_KINDS = ['generate', 'grade', 'tutor', 'drill'];
const AI_STATUSES = ['ok', 'error', 'timeout', 'rejected'];

function arrays<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function unique<T>(items: T[], key: (item: T) => string): boolean {
  return new Set(items.map(key)).size === items.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function oneOf(value: unknown, allowed: string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isCourse(value: unknown): value is BackupData['courses'][number] {
  return isRecord(value) && isString(value.id) && isNumber(value.number) && isString(value.title) && isString(value.topic)
    && isString(value.goal) && oneOf(value.source, COURSE_SOURCES) && oneOf(value.status, COURSE_STATUSES)
    && isNumber(value.createdAt) && isNumber(value.updatedAt);
}

function isWord(value: unknown): boolean {
  return isRecord(value) && isString(value.id) && isString(value.term) && isStringArray(value.meanings)
    && isString(value.example) && isString(value.exampleTranslation)
    && (value.phonetic === undefined || isString(value.phonetic));
}

function isQuestion(value: unknown): boolean {
  if (!isRecord(value) || !isString(value.id) || !oneOf(value.kind, QUESTION_KINDS) || !isString(value.prompt)) return false;
  if (value.kind === 'choice') {
    if (!Array.isArray(value.options) || !value.options.every(option => isRecord(option) && isString(option.id) && isString(option.label))) return false;
    return isString(value.answerId) && value.options.some(option => (option as { id: string }).id === value.answerId) && isString(value.explanation);
  }
  if (value.kind === 'fill') return isStringArray(value.answers) && isString(value.explanation);
  return isString(value.reference);
}

function isModuleContent(kind: string, content: unknown): boolean {
  if (!isRecord(content)) return false;
  if (kind === 'word') return Array.isArray(content.words) && content.words.every(isWord);
  if (kind === 'grammar') {
    return Array.isArray(content.sections)
      && content.sections.every(section => isRecord(section) && isString(section.title) && isString(section.body))
      && Array.isArray(content.questions) && content.questions.every(isQuestion);
  }
  if (kind === 'reading') return isString(content.passage) && Array.isArray(content.questions) && content.questions.every(isQuestion);
  return isStringArray(content.knowledgeIds) && Array.isArray(content.questions) && content.questions.every(isQuestion);
}

function isCourseModule(value: unknown): value is BackupData['courseModules'][number] {
  return isRecord(value) && isString(value.id) && isString(value.courseId) && oneOf(value.kind, MODULE_KINDS)
    && isNumber(value.order) && oneOf(value.status, MODULE_STATUSES)
    && isModuleContent(String(value.kind), value.content);
}

function isAnswer(value: unknown): value is BackupData['answers'][number] {
  return isRecord(value) && isString(value.id) && isString(value.courseId) && isString(value.moduleId)
    && isString(value.questionId) && oneOf(value.questionKind, QUESTION_KINDS) && isString(value.dateKey)
    && isNumber(value.updatedAt) && (value.value === null || isString(value.value));
}

function isGrade(value: unknown): value is BackupData['grades'][number] {
  return isRecord(value) && isString(value.id) && isString(value.answerId) && oneOf(value.status, GRADE_STATUSES)
    && oneOf(value.source, GRADE_SOURCES) && isNumber(value.gradedAt) && isStringArray(value.knowledgeIds);
}

function isKnowledge(value: unknown): value is BackupData['knowledge'][number] {
  return isRecord(value) && isString(value.id) && isString(value.label) && oneOf(value.kind, KNOWLEDGE_KINDS)
    && isNumber(value.stage) && oneOf(value.status, KNOWLEDGE_STATUSES)
    && isNumber(value.correctStreak) && isNumber(value.wrongStreak) && isNumber(value.updatedAt)
    && (value.source === undefined || oneOf(value.source, COURSE_SOURCES))
    && (value.confirmed === undefined || typeof value.confirmed === 'boolean');
}

function isHistoryDay(value: unknown): value is BackupData['historyDays'][number] {
  return isRecord(value) && isString(value.id) && isNumber(value.dayNumber) && isString(value.topic)
    && isString(value.source) && oneOf(value.evidence, ['studied', 'listed_only'])
    && isNumber(value.answerCount) && typeof value.confirmed === 'boolean' && isNumber(value.createdAt);
}

function isPendingAi(value: unknown): value is BackupData['pendingAi'][number] {
  return isRecord(value) && isString(value.id) && isString(value.courseId) && isString(value.moduleId)
    && isString(value.questionId) && isString(value.prompt) && isString(value.reference) && isString(value.answer)
    && oneOf(value.status, ['pending', 'failed']) && isNumber(value.createdAt)
    && (value.keyPoints === undefined || isStringArray(value.keyPoints))
    && (value.knowledgeIds === undefined || isStringArray(value.knowledgeIds))
    && (value.error === undefined || isString(value.error));
}

function isWordReview(value: unknown): value is BackupData['wordReviews'][number] {
  return isRecord(value) && isString(value.id) && isString(value.term)
    && oneOf(value.status, ['known', 'fuzzy', 'unknown']) && isNumber(value.updatedAt)
    && (value.courseId === undefined || isString(value.courseId))
    && (value.moduleId === undefined || isString(value.moduleId))
    && (value.wordId === undefined || isString(value.wordId))
    && (value.intervalDays === undefined || isNumber(value.intervalDays))
    && (value.dueAt === undefined || isNumber(value.dueAt))
    && (value.streak === undefined || isNumber(value.streak))
    && (value.lapses === undefined || isNumber(value.lapses))
    && (value.firstSeenAt === undefined || isNumber(value.firstSeenAt))
    && (value.lastReviewedAt === undefined || isNumber(value.lastReviewedAt))
    && (value.meanings === undefined || isStringArray(value.meanings));
}

function isReview(value: unknown): value is BackupData['reviews'][number] {
  return isRecord(value) && isString(value.id) && isString(value.knowledgeId) && isString(value.dueDate)
    && isString(value.reason) && oneOf(value.state, REVIEW_STATES) && isNumber(value.createdAt);
}

function isMistake(value: unknown): value is BackupData['mistakes'][number] {
  return isRecord(value) && isString(value.id) && isString(value.courseId) && isString(value.moduleId)
    && isString(value.questionId) && isString(value.wrongValue) && isString(value.reason)
    && isNumber(value.createdAt) && isNumber(value.updatedAt);
}

function isStudyDay(value: unknown): value is BackupData['studyDays'][number] {
  return isRecord(value) && isString(value.dateKey) && isNumber(value.seconds) && isNumber(value.coursesCompleted)
    && isNumber(value.modulesCompleted) && isNumber(value.firstActiveAt) && isNumber(value.lastActiveAt);
}

function isAiUsage(value: unknown): value is BackupData['aiUsage'][number] {
  return isRecord(value) && isString(value.id) && isString(value.dateKey) && oneOf(value.kind, AI_KINDS)
    && isString(value.model) && isNumber(value.tokensIn) && isNumber(value.tokensOut)
    && oneOf(value.status, AI_STATUSES) && isNumber(value.createdAt);
}

function isSettings(value: unknown): value is BackupData['settings'][number] {
  return isRecord(value) && value.id === 'app' && isString(value.appVersion) && isNumber(value.updatedAt)
    && (value.historyImportedAt === undefined || isNumber(value.historyImportedAt));
}
