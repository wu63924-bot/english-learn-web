import { describe, expect, it } from 'vitest';
import { examplePhrasesFor } from './phrases';

describe('example phrases', () => {
  it('prefers phrases marked by the generator', () => {
    expect(examplePhrasesFor({
      example: 'She was invited to the party.',
      examplePhrases: [{ phrase: 'be invited to', meaning: '被邀请参加' }]
    })).toEqual([{ phrase: 'be invited to', meaning: '被邀请参加' }]);
  });

  it('matches the course phrase list against the example', () => {
    expect(examplePhrasesFor(
      { example: 'I enjoy reading English books every day.' },
      [
        { phrase: 'enjoy reading', meaning: '喜欢阅读' },
        { phrase: 'look after', meaning: '照顾' }
      ]
    )).toEqual([{ phrase: 'enjoy reading', meaning: '喜欢阅读' }]);
  });

  it('deduplicates and keeps at most two phrases', () => {
    const result = examplePhrasesFor(
      {
        example: 'I enjoy reading and practise speaking English.',
        examplePhrases: [
          { phrase: 'enjoy reading', meaning: '喜欢阅读' },
          { phrase: 'practise speaking', meaning: '练习说' }
        ]
      },
      [{ phrase: 'enjoy reading', meaning: '喜欢阅读' }, { phrase: 'English', meaning: '英语' }]
    );
    expect(result.map(item => item.phrase)).toEqual(['enjoy reading', 'practise speaking']);
  });

  it('returns nothing when the example has no phrases', () => {
    expect(examplePhrasesFor({ example: 'The alarm rang.' }, [])).toEqual([]);
  });
});
