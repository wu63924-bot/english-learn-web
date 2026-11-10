import { describe, expect, it } from 'vitest';
import { parseExplainBody, splitExplainPoints } from './explain';

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

describe('grammar explanation points', () => {
  it('keeps short lines as single points', () => {
    expect(splitExplainPoints('主语是第三人称单数时，动词加 -s。')).toEqual([
      '主语是第三人称单数时，动词加 -s。'
    ]);
  });

  it('splits a long paragraph into one point per sentence', () => {
    const body = '一般现在时表示习惯、规律和事实，常用于描述每天都会发生的事情。主语是第三人称单数时，动词要加 -s 或 -es。否定句用 do not 或 does not 加动词原形。';
    expect(splitExplainPoints(body)).toEqual([
      '一般现在时表示习惯、规律和事实，常用于描述每天都会发生的事情。',
      '主语是第三人称单数时，动词要加 -s 或 -es。',
      '否定句用 do not 或 does not 加动词原形。'
    ]);
  });

  it('keeps a leftover fragment with the sentence before it', () => {
    expect(splitExplainPoints('第一句讲规则，要特别注意主语和动词形式的变化。例如：I often run.')).toEqual([
      '第一句讲规则，要特别注意主语和动词形式的变化。',
      '例如：I often run.'
    ]);
    expect(splitExplainPoints('这条规则比较长，需要慢慢读完再决定用哪个动词形式，不要着急。对吧？')).toEqual([
      '这条规则比较长，需要慢慢读完再决定用哪个动词形式，不要着急。对吧？'
    ]);
  });
});
