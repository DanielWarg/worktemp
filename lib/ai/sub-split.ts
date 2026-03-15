/**
 * Sub-split large clusters by entity signature.
 * Solves the catch-all problem (e.g. 22 TIMS tickets in one cluster).
 * Falls back to tighter cosine threshold if entity-split doesn't separate.
 */

import { type ExtractedEntities } from "./entity-extract";
import { EMBED_DIM } from "./embed-challenges";

export type TicketWithEntities = {
  id: string;
  text: string;
  entities: ExtractedEntities;
};

const MAX_CLUSTER_SIZE = 15;
const STRICT_COSINE_THRESHOLD = 0.45;

/**
 * Sub-split a cluster if it exceeds MAX_CLUSTER_SIZE.
 * Strategy 1: Group by entity signature.
 * Strategy 2: Sub-cluster with stricter cosine threshold.
 */
export function subSplitCluster(
  tickets: TicketWithEntities[],
  embeddings: Map<string, number[]>,
): TicketWithEntities[][] {
  if (tickets.length <= MAX_CLUSTER_SIZE) return [tickets];

  // Strategy 1: Group by entity signature
  const sigGroups = new Map<string, TicketWithEntities[]>();
  for (const t of tickets) {
    const sig = t.entities.signature;
    if (!sigGroups.has(sig)) sigGroups.set(sig, []);
    sigGroups.get(sig)!.push(t);
  }

  // If signature split produces meaningful groups (at least 2 groups, none too big)
  if (sigGroups.size >= 2) {
    const groups = [...sigGroups.values()];
    const allSmallEnough = groups.every((g) => g.length <= MAX_CLUSTER_SIZE);

    if (allSmallEnough) {
      // Filter out singletons — merge them into closest group
      const meaningful = groups.filter((g) => g.length >= 2);
      const singletons = groups.filter((g) => g.length < 2).flat();

      if (meaningful.length >= 2) {
        // Merge singletons into closest group (respecting size cap)
        for (const single of singletons) {
          let bestGroup = 0;
          let bestSim = -1;
          for (let i = 0; i < meaningful.length; i++) {
            if (meaningful[i].length >= MAX_CLUSTER_SIZE) continue;
            const sim = avgGroupSimilarity(single, meaningful[i], embeddings);
            if (sim > bestSim) {
              bestSim = sim;
              bestGroup = i;
            }
          }
          meaningful[bestGroup].push(single);
        }
        return enforceMaxSize(meaningful, embeddings);
      }
    }

    // Some groups still too big — recursively split the large ones
    const result: TicketWithEntities[][] = [];
    for (const group of groups) {
      if (group.length > MAX_CLUSTER_SIZE) {
        // Strategy 2: sub-cluster with stricter cosine
        result.push(...subClusterByCosine(group, embeddings));
      } else if (group.length >= 2) {
        result.push(group);
      } else {
        // Singleton — will be absorbed later
        result.push(group);
      }
    }
    return enforceMaxSize(result.length > 0 ? result : [tickets], embeddings);
  }

  // Strategy 2: All same signature — sub-cluster with stricter cosine
  return enforceMaxSize(subClusterByCosine(tickets, embeddings), embeddings);
}

/** Final safety: ensure no group exceeds MAX_CLUSTER_SIZE */
function enforceMaxSize(
  groups: TicketWithEntities[][],
  embeddings: Map<string, number[]>,
): TicketWithEntities[][] {
  const result: TicketWithEntities[][] = [];
  for (const group of groups) {
    if (group.length > MAX_CLUSTER_SIZE) {
      result.push(...forceHalve(group, embeddings));
    } else {
      result.push(group);
    }
  }
  return result;
}

/**
 * Agglomerative clustering with strict threshold + hard size cap.
 * If input exceeds MAX_CLUSTER_SIZE and clustering can't split it,
 * falls back to splitting by furthest-from-centroid.
 */
function subClusterByCosine(
  tickets: TicketWithEntities[],
  embeddings: Map<string, number[]>,
): TicketWithEntities[][] {
  // Start each ticket as its own cluster
  const clusters: TicketWithEntities[][] = tickets.map((t) => [t]);

  while (true) {
    let bestSim = -1;
    let bestI = -1;
    let bestJ = -1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = avgClusterSimilarity(clusters[i], clusters[j], embeddings);
        if (sim > bestSim) {
          bestSim = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // Stop if below strict threshold
    if (bestSim < STRICT_COSINE_THRESHOLD) break;

    // Stop if merge would exceed max
    const mergedSize = clusters[bestI].length + clusters[bestJ].length;
    if (mergedSize > MAX_CLUSTER_SIZE) break;

    // Merge j into i
    clusters[bestI].push(...clusters[bestJ]);
    clusters.splice(bestJ, 1);
  }

  // Absorb singletons into closest cluster (respecting hard cap)
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = clusters.length - 1; i >= 0; i--) {
      if (clusters[i].length < 2 && clusters.length > 1) {
        let bestTarget = -1;
        let bestSim = -1;
        for (let j = 0; j < clusters.length; j++) {
          if (j === i) continue;
          if (clusters[j].length + 1 > MAX_CLUSTER_SIZE) continue;
          const sim = avgClusterSimilarity(clusters[i], clusters[j], embeddings);
          if (sim > bestSim) {
            bestSim = sim;
            bestTarget = j;
          }
        }
        if (bestTarget >= 0) {
          clusters[bestTarget].push(...clusters[i]);
          clusters.splice(i, 1);
          changed = true;
        }
      }
    }
  }

  // Hard cap: force-split any remaining oversized clusters
  const result: TicketWithEntities[][] = [];
  for (const cluster of clusters) {
    if (cluster.length <= MAX_CLUSTER_SIZE) {
      result.push(cluster);
    } else {
      // Split by halving — sort by similarity to centroid, split at midpoint
      result.push(...forceHalve(cluster, embeddings));
    }
  }
  return result;
}

/** Force-split an oversized cluster into halves using centroid distance */
function forceHalve(
  tickets: TicketWithEntities[],
  embeddings: Map<string, number[]>,
): TicketWithEntities[][] {
  if (tickets.length <= MAX_CLUSTER_SIZE) return [tickets];

  // Compute centroid
  const dim = EMBED_DIM;
  const centroid = new Float32Array(dim);
  let count = 0;
  for (const t of tickets) {
    const v = embeddings.get(t.id);
    if (!v) continue;
    for (let i = 0; i < dim; i++) centroid[i] += v[i];
    count++;
  }
  if (count > 0) for (let i = 0; i < dim; i++) centroid[i] /= count;

  // Sort by distance from centroid (furthest first)
  const withDist = tickets.map((t) => {
    const v = embeddings.get(t.id);
    let dist = 0;
    if (v) {
      for (let i = 0; i < dim; i++) dist += (v[i] - centroid[i]) ** 2;
    }
    return { ticket: t, dist };
  });
  withDist.sort((a, b) => b.dist - a.dist);

  // Split at midpoint
  const mid = Math.ceil(withDist.length / 2);
  const groupA = withDist.slice(0, mid).map((w) => w.ticket);
  const groupB = withDist.slice(mid).map((w) => w.ticket);

  // Recursively halve if still too big
  return [
    ...forceHalve(groupA, embeddings),
    ...forceHalve(groupB, embeddings),
  ];
}

function avgClusterSimilarity(
  a: TicketWithEntities[],
  b: TicketWithEntities[],
  embeddings: Map<string, number[]>,
): number {
  let sum = 0;
  let count = 0;
  for (const ai of a) {
    const va = embeddings.get(ai.id);
    if (!va) continue;
    for (const bi of b) {
      const vb = embeddings.get(bi.id);
      if (!vb) continue;
      let dot = 0;
      for (let k = 0; k < va.length; k++) dot += va[k] * vb[k];
      sum += dot;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function avgGroupSimilarity(
  single: TicketWithEntities,
  group: TicketWithEntities[],
  embeddings: Map<string, number[]>,
): number {
  const va = embeddings.get(single.id);
  if (!va) return 0;
  let sum = 0;
  let count = 0;
  for (const t of group) {
    const vb = embeddings.get(t.id);
    if (!vb) continue;
    let dot = 0;
    for (let k = 0; k < va.length; k++) dot += va[k] * vb[k];
    sum += dot;
    count++;
  }
  return count > 0 ? sum / count : 0;
}
