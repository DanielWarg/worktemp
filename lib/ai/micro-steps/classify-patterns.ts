/**
 * Step 7: Classify pattern type (LLM, chunked).
 *
 * Two dimensions (GPT feedback):
 *   scopeType:    SINGLE_PERSON | CROSS_PERSON | CROSS_TEAM
 *   behaviorType: RECURRING | ESCALATING | ISOLATED
 *
 * Legacy patternType derived: behaviorType unless CROSS_*, then scopeType.
 */

import { localChat } from "../local-client";
import { parseJsonArray } from "./sanitize-json";
import type { NamedPattern } from "./name-patterns";

export type ClassifiedPattern = NamedPattern & {
  patternType: string;
  scopeType: string;
  behaviorType: string;
};

const CHUNK_SIZE = 12;

export async function classifyPatterns(
  patterns: NamedPattern[],
  ticketPersons: Map<string, string>
): Promise<ClassifiedPattern[]> {
  const results: ClassifiedPattern[] = [];

  for (let i = 0; i < patterns.length; i += CHUNK_SIZE) {
    const chunk = patterns.slice(i, i + CHUNK_SIZE);
    const classified = await classifyChunk(chunk, ticketPersons, i);
    results.push(...classified);
  }

  return results;
}

async function classifyChunk(
  patterns: NamedPattern[],
  ticketPersons: Map<string, string>,
  offset: number
): Promise<ClassifiedPattern[]> {
  const patternList = patterns
    .map((p, i) => {
      const persons = new Set(p.ticketIds.map((id) => ticketPersons.get(id)).filter(Boolean));
      return `${i}. "${p.title}" — ${p.ticketIds.length} ärenden, ${persons.size} unika personer: ${[...persons].slice(0, 5).join(", ")}`;
    })
    .join("\n");

  try {
    const raw = await localChat(
      [
        {
          role: "user",
          content: `Klassificera varje mönster i TVÅ dimensioner:

scope (vem drabbas):
- SINGLE_PERSON: bara en person
- CROSS_PERSON: flera personer, samma team/organisation
- CROSS_TEAM: spänner över flera organisationer

behavior (hur det beter sig):
- RECURRING: upprepas utan förvärring
- ESCALATING: förvärras eller ökar i frekvens
- ISOLATED: engångshändelse som bildar mönster bara genom antal

Mönster:
${patternList}

Returnera JSON-array:
[{"index": 0, "scope": "CROSS_PERSON", "behavior": "RECURRING"}]

JSON:`,
        },
      ],
      800
    );

    const parsed = parseJsonArray<{ index: number; scope: string; behavior: string }>(raw);
    const validScopes = new Set(["SINGLE_PERSON", "CROSS_PERSON", "CROSS_TEAM"]);
    const validBehaviors = new Set(["RECURRING", "ESCALATING", "ISOLATED"]);

    return patterns.map((p, i) => {
      const found = parsed.find((r) => r.index === i);
      const fb = fallbackClassify(p, ticketPersons);

      const scopeType = found?.scope && validScopes.has(found.scope) ? found.scope : fb.scopeType;
      const behaviorType = found?.behavior && validBehaviors.has(found.behavior) ? found.behavior : fb.behaviorType;

      return {
        ...p,
        scopeType,
        behaviorType,
        patternType: derivePatternType(scopeType, behaviorType),
      };
    });
  } catch (err) {
    console.warn(`[classify-patterns] LLM failed for chunk at offset ${offset}:`, err);
    return patterns.map((p) => {
      const fb = fallbackClassify(p, ticketPersons);
      return { ...p, ...fb, patternType: derivePatternType(fb.scopeType, fb.behaviorType) };
    });
  }
}

function fallbackClassify(
  pattern: NamedPattern, ticketPersons: Map<string, string>
): { scopeType: string; behaviorType: string } {
  const persons = new Set(pattern.ticketIds.map((id) => ticketPersons.get(id)).filter(Boolean));
  const scopeType = persons.size > 3 ? "CROSS_TEAM" : persons.size > 1 ? "CROSS_PERSON" : "SINGLE_PERSON";
  return { scopeType, behaviorType: "RECURRING" };
}

/** Map two dimensions back to legacy single patternType for DB compatibility */
function derivePatternType(scope: string, behavior: string): string {
  if (behavior === "ESCALATING") return "ESCALATING";
  if (scope === "CROSS_TEAM") return "CROSS_TEAM";
  if (scope === "CROSS_PERSON") return "CROSS_PERSON";
  return "RECURRING";
}
