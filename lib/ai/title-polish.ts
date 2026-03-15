/**
 * Step 6: Polish pattern titles using LLM.
 *
 * Takes deterministic entity-based titles + sample tickets,
 * outputs readable Swedish titles.
 *
 * This is the ONLY step that uses LLM, and it's optional.
 * Supports: Ollama (GPT-OSS, Ministral), llama.cpp, or skip.
 */

import { sanitizeJson } from "./micro-steps/sanitize-json";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ChatFn = (messages: ChatMessage[], maxTokens: number) => Promise<string>;

export type PatternForPolish = {
  title: string;
  entities: string[];
  ticketCount: number;
  evidence: { text: string; person: string }[];
};

export type PolishedTitle = {
  original: string;
  polished: string;
  fallbackUsed: boolean;
};

/**
 * Polish all pattern titles in one batch call.
 * Falls back to original titles on any failure.
 */
export async function polishTitles(
  patterns: PatternForPolish[],
  chatFn: ChatFn,
): Promise<PolishedTitle[]> {
  if (patterns.length === 0) return [];

  // Build prompt — all patterns in one call
  const patternDescriptions = patterns.map((p, i) => {
    const evidenceLines = p.evidence
      .slice(0, 3)
      .map((e) => `  - "${e.text}" (${e.person})`)
      .join("\n");
    return `${i + 1}. Nuvarande: "${p.title}"
   System: ${p.entities.length > 0 ? p.entities.slice(0, 3).join(", ") : "okänt"}
   ${p.ticketCount} ärenden. Exempel:
${evidenceLines}`;
  }).join("\n\n");

  const systemPrompt = `Du är en teknisk skribent. Du får en lista med automatiskt genererade mönster-titlar från en supportanalys. Varje titel har system-entiteter och exempelärenden.

Skriv en kort, läsbar svensk titel (max 60 tecken) för varje mönster som:
- Beskriver PROBLEMET, inte bara systemet
- Är specifik nog att en teamleader förstår vad det handlar om
- Behåller systemnamnet om det finns

Svara med JSON-array: ["titel1", "titel2", ...]
Exakt ${patterns.length} titlar, i samma ordning.`;

  const userPrompt = `Förbättra dessa ${patterns.length} mönster-titlar:\n\n${patternDescriptions}`;

  try {
    const raw = await chatFn(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      Math.max(500, patterns.length * 80),
    );

    const cleaned = sanitizeJson(raw);

    // Extract JSON array from response
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      console.warn("[title-polish] No JSON array found in response, using fallback");
      return patterns.map((p) => ({ original: p.title, polished: p.title, fallbackUsed: true }));
    }

    const titles: string[] = JSON.parse(arrayMatch[0]);

    if (!Array.isArray(titles) || titles.length !== patterns.length) {
      console.warn(`[title-polish] Expected ${patterns.length} titles, got ${titles.length}, using fallback`);
      return patterns.map((p, i) => ({
        original: p.title,
        polished: titles[i] && typeof titles[i] === "string" ? titles[i] : p.title,
        fallbackUsed: !titles[i],
      }));
    }

    return patterns.map((p, i) => ({
      original: p.title,
      polished: typeof titles[i] === "string" && titles[i].length > 0 ? titles[i] : p.title,
      fallbackUsed: typeof titles[i] !== "string" || titles[i].length === 0,
    }));
  } catch (err) {
    console.error("[title-polish] LLM call failed:", err);
    return patterns.map((p) => ({ original: p.title, polished: p.title, fallbackUsed: true }));
  }
}
