import { db } from '../db/db';
import type { Mistake, ModuleKind, Question } from '../types/domain';

export interface MistakeView {
  mistake: Mistake;
  courseNumber: number;
  courseTitle: string;
  moduleKind: ModuleKind;
  prompt: string;
  yourAnswer: string;
  correctAnswer: string;
  explanation: string;
}

export async function listMistakes(): Promise<MistakeView[]> {
  const mistakes = (await db.mistakes.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
  const views: MistakeView[] = [];
  for (const mistake of mistakes) {
    const [course, module] = await Promise.all([
      db.courses.get(mistake.courseId),
      db.courseModules.get(mistake.moduleId)
    ]);
    if (!course || !module) continue;
    const questions = 'questions' in module.content ? module.content.questions as Question[] : [];
    const question = questions.find(item => item.id === mistake.questionId);
    if (!question) continue;
    views.push({
      mistake,
      courseNumber: course.number,
      courseTitle: course.title,
      moduleKind: module.kind,
      prompt: question.prompt,
      yourAnswer: formatAnswer(question, mistake.wrongValue),
      correctAnswer: correctAnswerOf(question),
      explanation: 'explanation' in question && question.explanation ? question.explanation : question.kind === 'translate' ? question.reference : ''
    });
  }
  return views;
}

function optionLabel(question: Question, id: string): string {
  if (question.kind !== 'choice') return id;
  return question.options.find(option => option.id === id)?.label ?? id;
}

function formatAnswer(question: Question, value: string): string {
  if (!value.trim()) return '（空）';
  if (question.kind === 'choice') return optionLabel(question, value);
  return value;
}

function correctAnswerOf(question: Question): string {
  if (question.kind === 'choice') return optionLabel(question, question.answerId);
  if (question.kind === 'fill') return question.answers.join(' / ');
  return question.reference;
}
