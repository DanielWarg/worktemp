/**
 * Step 6: Polish pattern titles using LLM.
 *
 * Two strategies:
 * - Batch (JSON): One call for all titles. Works with Claude API.
 * - Sequential (plaintext): One call per title. Works with small local models.
 *
 * This is the ONLY step that uses LLM, and it's optional.
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

// ─── Sequential strategy (one title at a time, plaintext) ───

const SEQ_SYSTEM = `Du är en svensk supportanalytiker. Du skriver korta rubriker.

REGLER:
- Max 60 tecken
- Svenska
- Beskriv PROBLEMET, inte bara systemet
- Behåll systemnamn
- Svara med BARA rubriken, inget annat`;

/**
 * Polish titles one at a time with plaintext output.
 * Best for small local models (Qwen3-4B, Phi-4-mini etc).
 */
export async function polishTitlesSequential(
  patterns: PatternForPolish[],
  chatFn: ChatFn,
): Promise<PolishedTitle[]> {
  const results: PolishedTitle[] = [];

  for (const p of patterns) {
    const examples = p.evidence
      .slice(0, 3)
      .map((e) => `- "${e.text}"`)
      .join("\n");

    const userPrompt = `Nuvarande titel: "${p.title}"
System: ${p.entities.slice(0, 3).join(", ") || "okänt"}
${p.ticketCount} ärenden:
${examples}

Skriv en bättre rubrik:`;

    try {
      // Use higher max_tokens for thinking models (Qwen3 uses ~2000 tokens to think)
      const raw = await chatFn(
        [
          { role: "system", content: SEQ_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        3000,
      );

      // Clean: strip thinking tags (Qwen3), quotes, extra lines
      let title = raw
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .replace(/^[\s\n]+/, "")
        .replace(/^["'`«»]+|["'`«»]+$/g, "")
        .replace(/\n.*/g, "")
        .trim();

      // Validate: non-empty, reasonable length, not just the original
      if (title.length > 0 && title.length <= 80 && title !== p.title) {
        results.push({ original: p.title, polished: title, fallbackUsed: false });
      } else {
        results.push({ original: p.title, polished: p.title, fallbackUsed: true });
      }
    } catch {
      results.push({ original: p.title, polished: p.title, fallbackUsed: true });
    }
  }

  return results;
}

// ─── Combined: title + suggestion in one call (for production pipeline) ───

export type PolishResult = {
  original: string;
  polished: string;
  suggestion: string;
  fallbackUsed: boolean;
};

const COMBINED_SYSTEM = `Du är en svensk supportanalytiker. Du hjälper teamledare förstå mönster i supportärenden.

Du får ett mönster med system-entiteter och exempelärenden. Svara med exakt två rader:
RAD 1: En kort rubrik (max 60 tecken, svenska, beskriv problemet)
RAD 2: Ett kort åtgärdsförslag (max 120 tecken, svenska, konkret nästa steg)

Svara med BARA dessa två rader, inget annat.`;

/**
 * Polish title + generate suggestion in one call per pattern.
 * Used in production pipeline with Qwen2.5-7B.
 */
export async function polishWithSuggestions(
  patterns: PatternForPolish[],
  chatFn: ChatFn,
): Promise<PolishResult[]> {
  const results: PolishResult[] = [];

  for (const p of patterns) {
    const examples = p.evidence
      .slice(0, 3)
      .map((e) => `- "${e.text}"`)
      .join("\n");

    const userPrompt = `Mönster: "${p.title}"
System: ${p.entities.slice(0, 3).join(", ") || "okänt"}
${p.ticketCount} ärenden:
${examples}`;

    try {
      const raw = await chatFn(
        [
          { role: "system", content: COMBINED_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        200,
      );

      const cleaned = raw
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .replace(/^[\s\n]+/, "")
        .trim();

      const lines = cleaned.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

      const title = lines[0]
        ?.replace(/^["'`«»\d.)\s]+/, "")
        .replace(/["'`«»]+$/, "")
        .replace(/^(rubrik|titel|rad\s*1)[:\s]*/i, "")
        .trim();

      const suggestion = lines[1]
        ?.replace(/^["'`«»\d.)\s]+/, "")
        .replace(/["'`«»]+$/, "")
        .replace(/^(förslag|åtgärd|rad\s*2)[:\s]*/i, "")
        .trim();

      if (title && title.length > 0 && title.length <= 80) {
        results.push({
          original: p.title,
          polished: title,
          suggestion: suggestion || "",
          fallbackUsed: false,
        });
      } else {
        results.push({ original: p.title, polished: p.title, suggestion: suggestion || "", fallbackUsed: true });
      }
    } catch {
      results.push({ original: p.title, polished: p.title, suggestion: "", fallbackUsed: true });
    }
  }

  return results;
}

// ─── Batch strategy (JSON array, one call) ───

/**
 * Polish all titles in one batch call with JSON output.
 * Best for capable models (Claude API, large models).
 */
export async function polishTitles(
  patterns: PatternForPolish[],
  chatFn: ChatFn,
): Promise<PolishedTitle[]> {
  if (patterns.length === 0) return [];

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
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      console.warn("[title-polish] No JSON array in response, using fallback");
      return patterns.map((p) => ({ original: p.title, polished: p.title, fallbackUsed: true }));
    }

    const titles: string[] = JSON.parse(arrayMatch[0]);

    return patterns.map((p, i) => ({
      original: p.title,
      polished: titles[i] && typeof titles[i] === "string" && titles[i].length > 0 ? titles[i] : p.title,
      fallbackUsed: !titles[i] || typeof titles[i] !== "string",
    }));
  } catch (err) {
    console.error("[title-polish] LLM call failed:", err);
    return patterns.map((p) => ({ original: p.title, polished: p.title, fallbackUsed: true }));
  }
}
