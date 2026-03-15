/**
 * Pattern deduplication using dual signal: centroid similarity + topic overlap.
 *
 * Requires BOTH signals to merge — prevents merging patterns that are
 * close in embedding space but operationally different
 * (e.g. "TIMS inloggning" vs "TIMS diskutrymme").
 */

const EMBED_DIM = 384;

export function deduplicatePatterns<T extends {
  ticketIds: string[];
  topics: string[];
}>(
  patterns: T[],
  embeddings: Map<string, number[]>,
  centroidThreshold = 0.75,
  topicOverlapMin = 0.3,
): T[] {
  if (patterns.length <= 1) return patterns;

  // Compute centroid per pattern
  const centroids = patterns.map((p) => computeCentroid(p.ticketIds, embeddings));

  // Track which patterns are merged (index -> merged-into index)
  const mergedInto = new Array<number>(patterns.length);
  for (let i = 0; i < patterns.length; i++) mergedInto[i] = i;

  function root(i: number): number {
    while (mergedInto[i] !== i) i = mergedInto[i];
    return i;
  }

  // Find all candidate pairs with scores
  type Candidate = { i: number; j: number; centroidSim: number; topicOverlap: number; combined: number };
  const candidates: Candidate[] = [];

  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      const centroidSim = cosineSimilarity(centroids[i], centroids[j]);
      if (centroidSim < centroidThreshold) continue;

      const topicOverlap = jaccardSimilarity(patterns[i].topics, patterns[j].topics);
      if (topicOverlap < topicOverlapMin) continue;

      // Cap: don't merge if result would exceed 15 tickets
      const mergedSize = patterns[i].ticketIds.length + patterns[j].ticketIds.length;
      if (mergedSize > 15) continue;

      candidates.push({ i, j, centroidSim, topicOverlap, combined: centroidSim + topicOverlap });
    }
  }

  // Greedy merge: highest combined score first, smaller into larger
  candidates.sort((a, b) => b.combined - a.combined);

  for (const { i, j } of candidates) {
    const ri = root(i);
    const rj = root(j);
    if (ri === rj) continue; // Already merged

    // Re-check actual sizes after previous merges
    const actualMergedSize = patterns[ri].ticketIds.length + patterns[rj].ticketIds.length;
    if (actualMergedSize > 15) continue;

    // Merge smaller into larger
    const [larger, smaller] = patterns[ri].ticketIds.length >= patterns[rj].ticketIds.length
      ? [ri, rj] : [rj, ri];

    // Merge ticket IDs (deduplicated)
    const mergedIds = new Set([...patterns[larger].ticketIds, ...patterns[smaller].ticketIds]);
    patterns[larger] = {
      ...patterns[larger],
      ticketIds: [...mergedIds],
      topics: mergeTopics(patterns[larger].topics, patterns[smaller].topics),
    };

    mergedInto[smaller] = larger;
  }

  // Collect surviving patterns
  const result: T[] = [];
  for (let i = 0; i < patterns.length; i++) {
    if (root(i) === i) result.push(patterns[i]);
  }

  return result;
}

function computeCentroid(ticketIds: string[], embeddings: Map<string, number[]>): number[] {
  const centroid = new Float64Array(EMBED_DIM);
  let count = 0;
  for (const id of ticketIds) {
    const v = embeddings.get(id);
    if (!v) continue;
    for (let i = 0; i < EMBED_DIM; i++) centroid[i] += v[i];
    count++;
  }
  if (count > 0) {
    for (let i = 0; i < EMBED_DIM; i++) centroid[i] /= count;
  }
  return Array.from(centroid);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function mergeTopics(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of [...a, ...b]) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(t);
    }
  }
  return result.slice(0, 10);
}
