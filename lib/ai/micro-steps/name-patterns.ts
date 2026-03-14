/**
 * Step 6: Name + describe each pattern (LLM, batched 6-8).
 * Single cognitive task: "Give this group a specific title and one-sentence description."
 *
 * Larger batches (8) to reduce total LLM calls.
 */

import { localChat } from "../local-client";
import { contextPrefix } from "../context";
import { parseJsonArray } from "./sanitize-json";
import type { MergedPattern } from "./merge-themes";

export type NamedPattern = MergedPattern & {
  title: string;
  description: string;
};

const BATCH = 8;

export async function namePatterns(
  patterns: MergedPattern[],
  ticketTexts: Map<string, string>,
  systemContext = ""
): Promise<NamedPattern[]> {
  const results: NamedPattern[] = [];

  for (let i = 0; i < patterns.length; i += BATCH) {
    const batch = patterns.slice(i, i + BATCH);
    const named = await nameBatch(batch, ticketTexts, systemContext);
    results.push(...named);
  }

  return results;
}

async function nameBatch(
  patterns: MergedPattern[],
  ticketTexts: Map<string, string>,
  systemContext: string
): Promise<NamedPattern[]> {
  const patternBlocks = patterns.map((p, i) => {
    const samples = p.ticketIds
      .slice(0, 4)
      .map((id) => `  - ${ticketTexts.get(id) || id}`)
      .join("\n");
    return `Mönster ${i}:\nTema: ${p.label}\nExempel (${p.ticketIds.length} ärenden):\n${samples}`;
  }).join("\n\n");

  try {
    const raw = await localChat(
      [
        {
          role: "user",
          content: `${contextPrefix(systemContext)}Ge varje mönster en specifik titel och en kort beskrivning (1 mening).

BRA titel: "Certifikatfel i PubTrans GTFS-export"
DÅLIG titel: "Tekniska problem"

${patternBlocks}

Returnera JSON-array:
[{"index": 0, "title": "...", "description": "..."}]

JSON:`,
        },
      ],
      1000
    );

    const parsed = parseJsonArray<{ index: number; title: string; description: string }>(raw);

    return patterns.map((p, i) => {
      const found = parsed.find((r) => r.index === i);
      return {
        ...p,
        title: found?.title || p.label,
        description: found?.description || `Mönster baserat på ${p.ticketIds.length} ärenden`,
      };
    });
  } catch (err) {
    console.warn("[name-patterns] LLM failed, using label fallback:", err);
    return patterns.map((p) => ({
      ...p,
      title: p.label,
      description: `Mönster baserat på ${p.ticketIds.length} ärenden`,
    }));
  }
}
