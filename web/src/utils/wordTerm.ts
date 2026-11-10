/**
 * A word is identified by its written form, so "Want" and "want" share one
 * review record across courses. Only casing and outer punctuation are removed;
 * inflected forms (walk / walking) stay separate on purpose.
 */
export function normalizeWordTerm(term: string): string {
  return term
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[.,!?;:'"“”‘’()[\]{}]+/, '')
    .replace(/[.,!?;:'"“”‘’()[\]{}]+$/, '')
    .toLowerCase();
}

export function wordReviewId(term: string): string {
  return `w:${normalizeWordTerm(term)}`;
}
