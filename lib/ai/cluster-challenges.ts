/**
 * Agglomerative clustering based on cosine similarity.
 * Groups challenges into semantic clusters of 20-40 items (sweet spot for Ministral).
 */

export type ClusterItem = { id: string };

export type ClusterOptions = {
  similarityThreshold?: number;  // default 0.42
  minCluster?: number;           // default 3
  targetMin?: number;            // default 8
  targetMax?: number;            // default 20
};

const DEFAULT_MIN_CLUSTER = 3;
const DEFAULT_TARGET_MIN = 8;
const DEFAULT_TARGET_MAX = 12;
const DEFAULT_SIMILARITY_THRESHOLD = 0.42;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // Vectors are already normalized
}

/**
 * Cluster challenges by semantic similarity.
 * Falls back to equal-sized chunks if embeddings are missing.
 */
export function clusterChallenges<T extends ClusterItem>(
  items: T[],
  embeddings: Map<string, number[]>,
  options?: ClusterOptions,
): T[][] {
  const MIN_CLUSTER = options?.minCluster ?? DEFAULT_MIN_CLUSTER;
  const TARGET_MIN = options?.targetMin ?? DEFAULT_TARGET_MIN;
  const TARGET_MAX = options?.targetMax ?? DEFAULT_TARGET_MAX;
  const SIMILARITY_THRESHOLD = options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  if (items.length <= TARGET_MAX) return [items];

  // Build similarity matrix
  const n = items.length;
  const vecs = items.map((c) => embeddings.get(c.id));

  // If too many items lack embeddings, fall back
  const missingCount = vecs.filter((v) => !v).length;
  if (missingCount > n * 0.2) {
    console.warn(`[cluster] ${missingCount}/${n} items missing embeddings, falling back to chunks`);
    return chunkArray(items, TARGET_MIN);
  }

  // Agglomerative clustering — each item starts as its own cluster
  type Cluster = { indices: number[] };
  const clusters: Cluster[] = items.map((_, i) => ({ indices: [i] }));

  // Pre-compute pairwise similarities for efficiency
  while (clusters.length > Math.ceil(n / TARGET_MAX)) {
    let bestSim = -1;
    let bestI = -1;
    let bestJ = -1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Average-linkage similarity between clusters
        const sim = avgLinkage(clusters[i].indices, clusters[j].indices, vecs);
        if (sim > bestSim) {
          bestSim = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // Stop merging if best similarity is too low
    if (bestSim < SIMILARITY_THRESHOLD) break;

    // Hard cap: never exceed target max
    const mergedSize = clusters[bestI].indices.length + clusters[bestJ].indices.length;
    if (mergedSize > TARGET_MAX) {
      break;
    }

    // Merge j into i
    clusters[bestI].indices.push(...clusters[bestJ].indices);
    clusters.splice(bestJ, 1);
  }

  // Absorb tiny clusters (< MIN_CLUSTER) into most similar neighbor
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = clusters.length - 1; i >= 0; i--) {
      if (clusters[i].indices.length < MIN_CLUSTER && clusters.length > 1) {
        let bestTarget = -1;
        let bestSim = -1;
        for (let j = 0; j < clusters.length; j++) {
          if (j === i) continue;
          if (clusters[j].indices.length + clusters[i].indices.length > TARGET_MAX) continue;
          const sim = avgLinkage(clusters[i].indices, clusters[j].indices, vecs);
          if (sim > bestSim) {
            bestSim = sim;
            bestTarget = j;
          }
        }
        if (bestTarget >= 0) {
          clusters[bestTarget].indices.push(...clusters[i].indices);
          clusters.splice(i, 1);
          changed = true;
        }
      }
    }
  }

  return clusters.map((c) => c.indices.map((i) => items[i]));
}

function avgLinkage(
  a: number[],
  b: number[],
  vecs: (number[] | undefined)[]
): number {
  let sum = 0;
  let count = 0;
  for (const i of a) {
    for (const j of b) {
      const vi = vecs[i];
      const vj = vecs[j];
      if (vi && vj) {
        sum += cosineSimilarity(vi, vj);
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
