export type ExplainBlock =
  | { type: 'text'; value: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

const MIN_POINT_LENGTH = 6;
const SPLIT_THRESHOLD = 30;

/**
 * Splits a long explanation paragraph into short, separate points so the
 * grammar panel reads as rules instead of one dense wall of text. Short lines
 * stay untouched, and fragments that would read as leftovers are merged back.
 */
export function splitExplainPoints(text: string): string[] {
  const points: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.length <= SPLIT_THRESHOLD) {
      points.push(line);
      continue;
    }
    const sentences = line.match(/[^。！？!?]+[。！？!?]?/g) ?? [line];
    for (const sentence of sentences.map(item => item.trim()).filter(Boolean)) {
      const previous = points[points.length - 1];
      if (sentence.length < MIN_POINT_LENGTH && previous !== undefined) {
        points[points.length - 1] = `${previous}${sentence}`;
        continue;
      }
      points.push(sentence);
    }
  }
  return points;
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function isSeparator(line: string): boolean {
  const parts = cells(line);
  return parts.length > 0 && parts.every(part => /^:?-{3,}:?$/.test(part));
}

function isTableLine(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|');
}

/**
 * Splits a grammar explanation into paragraphs and simple Markdown tables.
 * Anything that does not look like a table stays plain text, so older courses
 * and AI output without tables render as before.
 */
export function parseExplainBody(body: string): ExplainBlock[] {
  const lines = body.split(/\r?\n/);
  const blocks: ExplainBlock[] = [];
  let text: string[] = [];
  let index = 0;

  const flushText = () => {
    const value = text.join('\n').trim();
    if (value) blocks.push({ type: 'text', value });
    text = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const next = lines[index + 1];
    if (isTableLine(line) && next !== undefined && isSeparator(next)) {
      flushText();
      const headers = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableLine(lines[index])) {
        rows.push(cells(lines[index]));
        index += 1;
      }
      if (headers.length) blocks.push({ type: 'table', headers, rows });
      continue;
    }
    if (line.trim()) text.push(line.trim());
    index += 1;
  }
  flushText();
  return blocks;
}
