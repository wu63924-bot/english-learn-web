import type { ChoiceQuestion, GrammarSection, Question, WordItem } from '../types/domain';

export interface GeneratedCoursePayload {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isQuestion(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.id) || !isText(value.prompt)) return false;
  if (value.kind === 'choice') {
    return Array.isArray(value.options)
      && value.options.length >= 2
      && value.options.every(option => isRecord(option) && isText(option.id) && isText(option.label))
      && typeof value.answerId === 'string'
      && value.options.some(option => (option as { id?: unknown }).id === value.answerId)
      && isText(value.explanation);
  }
  if (value.kind === 'translate') return isText(value.reference);
  return false;
}

/** Rejects an AI payload before it can reach the database. */
export function assertGeneratedCourse(value: unknown): GeneratedCoursePayload {
  if (!isRecord(value)) throw new Error('AI 返回的课程不是对象');
  if (!isText(value.title) || !isText(value.topic) || !isText(value.goal)) throw new Error('课程标题、主题或目标缺失');
  if (!Array.isArray(value.words) || value.words.length < 3) throw new Error('单词数量不足');
  for (const word of value.words) {
    if (!isRecord(word) || !isText(word.term) || !Array.isArray(word.meanings) || !isText(word.example) || !isText(word.exampleTranslation)) {
      throw new Error('单词内容不完整');
    }
  }
  if (!Array.isArray(value.grammarSections) || value.grammarSections.length < 1) throw new Error('语法讲解缺失');
  if (!Array.isArray(value.grammarQuestions) || value.grammarQuestions.length < 2) throw new Error('语法练习题不足');
  if (!Array.isArray(value.readingQuestions) || value.readingQuestions.length < 1) throw new Error('阅读题缺失');
  if (!Array.isArray(value.reviewQuestions) || value.reviewQuestions.length < 1) throw new Error('复习题缺失');
  if (!Array.isArray(value.knowledgeLabels) || value.knowledgeLabels.length < 1) throw new Error('知识点缺失');
  if (!isText(value.passage)) throw new Error('短文缺失');
  for (const question of [...(value.readingQuestions as unknown[]), ...(value.reviewQuestions as unknown[])]) {
    if (!isQuestion(question)) throw new Error('题目结构不完整');
  }
  for (const question of value.grammarQuestions as unknown[]) {
    if (!isRecord(question) || question.kind !== 'choice' || !isQuestion(question)) throw new Error('语法题结构不完整');
  }
  for (const section of value.grammarSections as unknown[]) {
    if (!isRecord(section) || !isText(section.title) || !isText(section.body)) throw new Error('语法讲解结构不完整');
  }
  return value as unknown as GeneratedCoursePayload;
}
