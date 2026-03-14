/**
 * Step 8: Write structured evidence per pattern (LLM, batched).
 *
 * Structured output (GPT feedback):
 *   ticketCount, exampleIds, entities, evidenceText, confidence
 *
 * Bigger batches (5) since each pattern block is smaller now.
 */

import { localChat } from "../local-client";
import { contextPrefix } from "../context";
import { parseJsonArray } from "./sanitize-json";
import type { ClassifiedPattern } from "./classify-patterns";

export type StructuredEvidence = {
  ticketCount: number;
  exampleIds: string[];
  entities: string[];
  evidenceText: string;
  confidence: "high" | "medium" | "low";
};

export type EvidencedPattern = ClassifiedPattern & {
  evidence: StructuredEvidence;
  suggestion: string;
};

const BATCH = 5;

export async function writeEvidence(
  patterns: ClassifiedPattern[],
  ticketDetails: Map<string, { text: string; person: string; tags: string[] }>,
  systemContext = ""
): Promise<EvidencedPattern[]> {
  const results: EvidencedPattern[] = [];

  for (let i = 0; i < patterns.length; i += BATCH) {
    const batch = patterns.slice(i, i + BATCH);
    const evidenced = await evidenceBatch(batch, ticketDetails, systemContext);
    results.push(...evidenced);
  }

  return results;
}

async function evidenceBatch(
  patterns: ClassifiedPattern[],
  ticketDetails: Map<string, { text: string; person: string; tags: string[] }>,
  systemContext: string
): Promise<EvidencedPattern[]> {
  const patternBlocks = patterns
    .map((p, i) => {
      const tickets = p.ticketIds
        .slice(0, 6)
        .map((id) => {
          const d = ticketDetails.get(id);
          return d ? `  - [${d.person}] ${d.text}` : `  - ${id}`;
        })
        .join("\n");
      return `Mönster ${i}: "${p.title}" (${p.scopeType}/${p.behaviorType}, ${p.ticketIds.length} ärenden)\n${tickets}`;
    })
    .join("\n\n");

  try {
    const raw = await localChat(
      [
        {
          role: "user",
          content: `${contextPrefix(systemContext)}Skriv strukturerad evidens för varje mönster.

${patternBlocks}

Returnera JSON-array (undvik radbrytningar i strängar):
[{"index": 0, "entities": ["PubTrans", "GTFS"], "evidenceText": "kort bevis", "confidence": "high", "suggestion": "en konkret åtgärd"}]

entities = system, produkter, eller teknologier som nämns.
confidence = high (tydlig koppling), medium (rimlig), low (svag).

JSON:`,
        },
      ],
      1500
    );

    const parsed = parseJsonArray<{
      index: number;
      entities?: string[];
      evidenceText?: string;
      confidence?: string;
      suggestion?: string;
    }>(raw);

    const validConf = new Set(["high", "medium", "low"]);

    return patterns.map((p, i) => {
      const found = parsed.find((r) => r.index === i);
      const fb = fallbackEvidence(p, ticketDetails);

      // Guard against LLM returning objects instead of strings
      const evText = typeof found?.evidenceText === "string" ? found.evidenceText : fb.evidenceText;
      const sug = typeof found?.suggestion === "string" ? found.suggestion : "Utred grundorsaken och åtgärda";

      return {
        ...p,
        evidence: {
          ticketCount: p.ticketIds.length,
          exampleIds: p.ticketIds.slice(0, 5),
          entities: found?.entities?.filter((e) => typeof e === "string") || fb.entities,
          evidenceText: evText,
          confidence: (found?.confidence && validConf.has(found.confidence)
            ? found.confidence
            : fb.confidence) as "high" | "medium" | "low",
        },
        suggestion: sug,
      };
    });
  } catch (err) {
    console.warn("[write-evidence] LLM failed, using fallback:", err);
    return patterns.map((p) => {
      const fb = fallbackEvidence(p, ticketDetails);
      return {
        ...p,
        evidence: {
          ticketCount: p.ticketIds.length,
          exampleIds: p.ticketIds.slice(0, 5),
          ...fb,
        },
        suggestion: "Utred grundorsaken och åtgärda",
      };
    });
  }
}

function fallbackEvidence(
  pattern: ClassifiedPattern,
  ticketDetails: Map<string, { text: string; person: string; tags: string[] }>
): { entities: string[]; evidenceText: string; confidence: "high" | "medium" | "low" } {
  // Extract entities from tags
  const allTags = new Set<string>();
  for (const id of pattern.ticketIds) {
    const d = ticketDetails.get(id);
    if (d) for (const t of d.tags) allTags.add(t);
  }

  const samples = pattern.ticketIds
    .slice(0, 3)
    .map((id) => {
      const d = ticketDetails.get(id);
      return d ? `${d.person}: "${d.text}"` : id;
    })
    .join("; ");

  const count = pattern.ticketIds.length;
  return {
    entities: [...allTags].slice(0, 5),
    evidenceText: `${count} ärenden: ${samples}`,
    confidence: count >= 5 ? "high" : count >= 3 ? "medium" : "low",
  };
}
