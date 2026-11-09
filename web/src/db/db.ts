import Dexie, { type EntityTable } from 'dexie';
import type {
  AiUsageRecord,
  AnswerRecord,
  AppSettings,
  Course,
  CourseModule,
  Grade,
  HistoryDay,
  KnowledgePoint,
  Mistake,
  ReviewItem,
  StudyDay
} from '../types/domain';

export const DB_NAME = 'EnglishLearnDB';

export const db = new Dexie(DB_NAME) as Dexie & {
  courses: EntityTable<Course, 'id'>;
  courseModules: EntityTable<CourseModule, 'id'>;
  answers: EntityTable<AnswerRecord, 'id'>;
  grades: EntityTable<Grade, 'id'>;
  knowledge: EntityTable<KnowledgePoint, 'id'>;
  reviews: EntityTable<ReviewItem, 'id'>;
  mistakes: EntityTable<Mistake, 'id'>;
  studyDays: EntityTable<StudyDay, 'dateKey'>;
  aiUsage: EntityTable<AiUsageRecord, 'id'>;
  historyDays: EntityTable<HistoryDay, 'id'>;
  settings: EntityTable<AppSettings, 'id'>;
};

// Indexed fields only. Content stays in the record; version changes add stores here.
db.version(1).stores({
  courses: '&id, status, source, startedDate, createdAt',
  courseModules: '&id, courseId, [courseId+order], status',
  answers: '&id, courseId, moduleId, updatedAt',
  grades: '&id, answerId, status',
  knowledge: '&id, status, nextReviewDate, [status+nextReviewDate]',
  reviews: '&id, knowledgeId, dueDate, [state+dueDate]',
  mistakes: '&id, knowledgeId, courseId, createdAt',
  studyDays: '&dateKey',
  aiUsage: '&id, dateKey, kind',
  settings: '&id'
});

db.version(2).stores({
  courses: '&id, status, source, startedDate, createdAt',
  courseModules: '&id, courseId, [courseId+order], status',
  answers: '&id, courseId, moduleId, updatedAt',
  grades: '&id, answerId, status',
  knowledge: '&id, status, nextReviewDate, [status+nextReviewDate]',
  reviews: '&id, knowledgeId, dueDate, [state+dueDate]',
  mistakes: '&id, knowledgeId, courseId, createdAt',
  studyDays: '&dateKey',
  aiUsage: '&id, dateKey, kind',
  historyDays: '&id, dayNumber, source',
  settings: '&id'
});
