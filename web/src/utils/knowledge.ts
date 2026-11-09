/** Stable identity for the same knowledge point across courses and history. */
export function normalizeKnowledgeLabel(label: string): string {
  return label
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s：:，,。.、·()（）\-—_/\\'"“”‘’]/g, '');
}

export function knowledgeIdFor(label: string): string {
  let hash = 5381;
  const key = normalizeKnowledgeLabel(label);
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) + hash + key.charCodeAt(index)) >>> 0;
  }
  return `kp-${hash.toString(36)}`;
}
