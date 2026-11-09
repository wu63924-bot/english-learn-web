import type { CourseModule, ModuleKind, ModuleStatus } from '../types/domain';

export const moduleOrder: ModuleKind[] = ['word', 'grammar', 'reading', 'review'];

export function isModuleKind(value: string | undefined): value is ModuleKind {
  return !!value && (moduleOrder as string[]).includes(value);
}

export const moduleLabels: Record<ModuleKind, string> = {
  word: '单词',
  grammar: '语法与练习',
  reading: '阅读与翻译',
  review: '巩固复习'
};

export const moduleStatusLabels: Record<ModuleStatus, string> = {
  todo: '未开始',
  draft: '进行中',
  answered: '已作答',
  graded: '已完成'
};

export function moduleProgress(modules: CourseModule[]): { completed: number; total: number } {
  return {
    completed: modules.filter(module => module.status === 'graded' || module.status === 'answered').length,
    total: modules.length
  };
}
