/**
 * Step 5: Cross-cluster theme merge (deterministic).
 *
 * Stricter merge criteria (GPT feedback): require label similarity
 * AND at least one of: tag overlap or person overlap.
 * Label similarity alone can merge "TIMS synlighet" with "TIMS behörighet".
 */

import type { ValidatedTheme } from "./validate-themes";

export type MergedPattern = {
  label: string;
  ticketIds: string[];
  sourceClusterIndices: number[];
};

/**
 * Merge similar themes across clusters.
 * Requires: label_sim > 0.80 AND (tag_overlap > 0.3 OR person_overlap > 0.3)
 */
export async function mergeThemesAcrossClusters(
  clusterThemes: { clusterIndex: number; themes: ValidatedTheme[] }[],
  ticketPersons: Map<string, string>,
  embeddings: Map<string, number[]>,
  ticketTags?: Map<string, string[]>
): Promise<MergedPattern[]> {
  const allThemes: (MergedPattern & { _labelVec?: number[] })[] = [];
  for (const ct of clusterThemes) {
    for (const theme of ct.themes) {
      allThemes.push({
        label: theme.label,
        ticketIds: [...theme.ticketIds],
        sourceClusterIndices: [ct.clusterIndex],
      });
    }
  }

  if (allThemes.length === 0) return [];

  // Embed theme labels
  const { embedChallenges } = await import("../embed-challenges");
  const labelItems = allThemes.map((t, i) => ({
    id: `__merge_${i}`,
    text: t.label,
  }));
  const labelEmbeddings = await embedChallenges(labelItems);

  for (let i = 0; i < allThemes.length; i++) {
    allThemes[i]._labelVec = labelEmbeddings.get(`__merge_${i}`);
  }

  // Greedy merge with stricter criteria
  let merged = true;
  while (merged) {
    merged = false;
    let bestI = -1;
    let bestJ = -1;
    let bestScore = 0;

    for (let i = 0; i < allThemes.length; i++) {
      for (let j = i + 1; j < allThemes.length; j++) {
        // Only merge across different clusters
        const sharedClusters = allThemes[i].sourceClusterIndices.some((c) =>
          allThemes[j].sourceClusterIndices.includes(c)
        );
        if (sharedClusters) continue;

        const labelSim = cosineSim(allThemes[i]._labelVec, allThemes[j]._labelVec);
        if (labelSim < 0.80) continue; // Higher threshold

        // Require at least one overlap signal beyond label similarity
        const personOvl = calcPersonOverlap(
          allThemes[i].ticketIds, allThemes[j].ticketIds, ticketPersons
        );
        const tagOvl = ticketTags
          ? calcTagOverlap(allThemes[i].ticketIds, allThemes[j].ticketIds, ticketTags)
          : 0;

        if (personOvl < 0.3 && tagOvl < 0.3) continue; // Must have supporting signal

        const score = labelSim + personOvl * 0.2 + tagOvl * 0.1;
        if (score > bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestI >= 0 && bestJ >= 0) {
      if (allThemes[bestJ].ticketIds.length > allThemes[bestI].ticketIds.length) {
        allThemes[bestI].label = allThemes[bestJ].label;
        allThemes[bestI]._labelVec = allThemes[bestJ]._labelVec;
      }
      const existing = new Set(allThemes[bestI].ticketIds);
      for (const id of allThemes[bestJ].ticketIds) {
        if (!existing.has(id)) allThemes[bestI].ticketIds.push(id);
      }
      allThemes[bestI].sourceClusterIndices.push(...allThemes[bestJ].sourceClusterIndices);
      allThemes.splice(bestJ, 1);
      merged = true;
      console.log(`[merge] "${allThemes[bestI].label}" absorbed theme (score=${bestScore.toFixed(2)})`);
    }
  }

  return allThemes.map(({ label, ticketIds, sourceClusterIndices }) => ({
    label,
    ticketIds,
    sourceClusterIndices,
  }));
}

function cosineSim(a?: number[], b?: number[]): number {
  if (!a || !b) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function calcPersonOverlap(
  idsA: string[], idsB: string[], ticketPersons: Map<string, string>
): number {
  const personsA = new Set(idsA.map((id) => ticketPersons.get(id)).filter(Boolean));
  const personsB = new Set(idsB.map((id) => ticketPersons.get(id)).filter(Boolean));
  if (personsA.size === 0 || personsB.size === 0) return 0;
  let shared = 0;
  for (const p of personsA) { if (personsB.has(p)) shared++; }
  return shared / Math.min(personsA.size, personsB.size);
}

function calcTagOverlap(
  idsA: string[], idsB: string[], ticketTags: Map<string, string[]>
): number {
  const tagsA = new Set(idsA.flatMap((id) => ticketTags.get(id) || []));
  const tagsB = new Set(idsB.flatMap((id) => ticketTags.get(id) || []));
  if (tagsA.size === 0 || tagsB.size === 0) return 0;
  let shared = 0;
  for (const t of tagsA) { if (tagsB.has(t)) shared++; }
  return shared / Math.min(tagsA.size, tagsB.size);
}
