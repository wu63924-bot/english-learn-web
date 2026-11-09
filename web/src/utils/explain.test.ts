import { describe, expect, it } from 'vitest';
import { parseExplainBody } from './explain';

describe('grammar explanation parser', () => {
  it('keeps plain paragraphs unchanged', () => {
    expect(parseExplainBody('第一段\n第二行\n\n第二段')).toEqual([
      { type: 'text', value: '第一段\n第二行\n第二段' }
    ]);
  });

  it('turns a Markdown table into a table block', () => {
    const body = [
      '看下面的对比：',
      '| 主语 | 正确表达 |',
      '| --- | --- |',
      '| I | I want to study. |',
      '| He | He wants to study. |',
      '表格后面还有一句。'
    ].join('\n');

    expect(parseExplainBody(body)).toEqual([
      { type: 'text', value: '看下面的对比：' },
      {
        type: 'table',
        headers: ['主语', '正确表达'],
        rows: [['I', 'I want to study.'], ['He', 'He wants to study.']]
      },
      { type: 'text', value: '表格后面还有一句。' }
    ]);
  });

  it('treats a broken table as text', () => {
    expect(parseExplainBody('| 只有表头 |\n不是表格')).toEqual([
      { type: 'text', value: '| 只有表头 |\n不是表格' }
    ]);
  });
});
