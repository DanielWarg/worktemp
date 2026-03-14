/**
 * Step 2: Extract 2-5 sub-themes per cluster.
 * Single cognitive task: "What topics exist in this group?"
 *
 * For small clusters (≤8 tickets), skips LLM entirely and uses
 * tag-based grouping — saves ~25s per call.
 */

import { localChat } from "../local-client";
import { contextPrefix } from "../context";
import { parseJsonArray } from "./sanitize-json";

export type ThemeResult = {
  themes: string[];
  fallbackUsed: boolean;
};

const SMALL_CLUSTER_THRESHOLD = 8;

/**
 * Ask LLM to identify 2-5 topic labels from a cluster of tickets.
 * Small clusters (≤8) skip LLM entirely.
 * Fallback: use most frequent tags as theme labels.
 */
export async function extractThemes(
  tickets: { text: string; tags: string[] }[],
  systemContext = ""
): Promise<ThemeResult> {
  // Small clusters: don't waste an LLM call
  if (tickets.length <= SMALL_CLUSTER_THRESHOLD) {
    return tagFallback(tickets);
  }

  const numbered = tickets.map((t, i) => `${i + 1}. ${t.text}`).join("\n");

  try {
    const raw = await localChat(
      [
        {
          role: "user",
          content: `${contextPrefix(systemContext)}Nedan finns en grupp relaterade ärenden från supportmöten. Identifiera 2-5 distinkta underteman/ämnen som beskriver de olika problemen i gruppen.

Returnera BARA en JSON-array med korta tema-etiketter på svenska. Inga förklaringar.

Exempel: ["TIMS synlighetsproblem", "CAD/AVL-integration", "diskutrymme"]

Ärenden:
${numbered}

JSON-array:`,
        },
      ],
      500
    );

    const themes = parseJsonArray<string>(raw);
    if (themes.length === 0) throw new Error("Empty themes");
    if (!themes.every((t) => typeof t === "string")) throw new Error("Non-string themes");

    // Clamp to 2-5
    const clamped = themes.slice(0, 5);
    if (clamped.length < 2 && tickets.length >= 4) {
      return tagFallback(tickets);
    }

    return { themes: clamped, fallbackUsed: false };
  } catch (err) {
    console.warn("[extract-themes] LLM failed, using tag fallback:", err);
    return tagFallback(tickets);
  }
}

function tagFallback(tickets: { text: string; tags: string[] }[]): ThemeResult {
  const tagCount = new Map<string, number>();
  for (const t of tickets) {
    for (const tag of t.tags) {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    }
  }

  const sorted = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  if (sorted.length < 2) {
    sorted.push("Övrigt");
  }

  return { themes: sorted, fallbackUsed: true };
}
