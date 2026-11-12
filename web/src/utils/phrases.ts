import type { PhraseItem, WordItem } from '../types/domain';

const MAX_PHRASES = 2;

/**
 * 例句下的搭配注释：优先用 AI 标好的 examplePhrases，
 * 旧课程则用本课短语表去匹配例句，最多两条。
 */
export function examplePhrasesFor(
  word: Pick<WordItem, 'example' | 'examplePhrases'>,
  coursePhrases: PhraseItem[] = []
): PhraseItem[] {
  const result: PhraseItem[] = [];
  const seen = new Set<string>();

  const push = (phrase: string, meaning: string) => {
    const key = phrase.trim().toLowerCase();
    if (!key || !meaning.trim() || seen.has(key) || result.length >= MAX_PHRASES) return;
    seen.add(key);
    result.push({ phrase: phrase.trim(), meaning: meaning.trim() });
  };

  for (const item of word.examplePhrases ?? []) push(item.phrase, item.meaning);

  const example = word.example.toLowerCase();
  for (const item of coursePhrases) {
    if (result.length >= MAX_PHRASES) break;
    const phrase = item.phrase.trim().toLowerCase();
    if (phrase && example.includes(phrase)) push(item.phrase, item.meaning);
  }

  return result;
}
