/**
 * Step 4: Validate and clean themes (deterministic).
 * - Drop themes with <2 tickets
 * - Try to rescue "none" tickets to nearest theme by embedding
 * - Merge themes within same cluster with high word overlap
 * - Verify all IDs exist
 */

export type ValidatedTheme = {
  label: string;
  ticketIds: string[];
};

export function validateThemes(
  assignments: Map<string, string[]>,
  unassigned: string[],
  embeddings: Map<string, number[]>,
  validIds: Set<string>
): ValidatedTheme[] {
  // Start with assignments, filtering invalid IDs
  const themes: ValidatedTheme[] = [];
  for (const [label, ids] of assignments) {
    const valid = ids.filter((id) => validIds.has(id));
    if (valid.length > 0) {
      themes.push({ label, ticketIds: valid });
    }
  }

  // Try to rescue unassigned tickets to nearest theme by embedding
  const rescuable = unassigned.filter((id) => validIds.has(id));
  for (const id of rescuable) {
    const vec = embeddings.get(id);
    if (!vec) continue;

    let bestTheme = -1;
    let bestSim = 0.4; // Threshold

    for (let i = 0; i < themes.length; i++) {
      const themeSim = avgSimilarity(vec, themes[i].ticketIds, embeddings);
      if (themeSim > bestSim) {
        bestSim = themeSim;
        bestTheme = i;
      }
    }

    if (bestTheme >= 0) {
      themes[bestTheme].ticketIds.push(id);
    }
  }

  // Merge themes with >70% word overlap in label
  mergeOverlappingLabels(themes);

  // Drop themes with <2 tickets
  return themes.filter((t) => t.ticketIds.length >= 2);
}

function avgSimilarity(
  vec: number[],
  ticketIds: string[],
  embeddings: Map<string, number[]>
): number {
  let sum = 0;
  let count = 0;
  for (const id of ticketIds) {
    const other = embeddings.get(id);
    if (!other) continue;
    let dot = 0;
    for (let i = 0; i < vec.length; i++) dot += vec[i] * other[i];
    sum += dot;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function mergeOverlappingLabels(themes: ValidatedTheme[]): void {
  for (let i = themes.length - 1; i >= 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (wordOverlap(themes[i].label, themes[j].label) > 0.7) {
        // Merge i into j (keep j's label if j is larger)
        if (themes[i].ticketIds.length > themes[j].ticketIds.length) {
          themes[j].label = themes[i].label;
        }
        const existing = new Set(themes[j].ticketIds);
        for (const id of themes[i].ticketIds) {
          if (!existing.has(id)) themes[j].ticketIds.push(id);
        }
        themes.splice(i, 1);
        break;
      }
    }
  }
}

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const union = new Set([...wordsA, ...wordsB]);
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return union.size > 0 ? intersection / union.size : 0;
}
