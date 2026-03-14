/**
 * Eval on real HPTS data — 265 tickets from "Skapade ärenden förra månaden"
 * Tests batching, deduplication, and quality at scale.
 *
 * Usage: npx tsx scripts/eval-real-data.ts
 */

import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import { config } from "dotenv";

config({ path: new URL("../.env.local", import.meta.url).pathname });
config({ path: new URL("../.env", import.meta.url).pathname });

const LOCAL_URL = process.env.LOCAL_LLM_URL || "http://127.0.0.1:8081";
const XLSX_PATH = "/Users/evil/Downloads/Skapade ärenden förra månaden 2026_03_13 11-06-2 8.xlsx";

// ── Parse Excel ──────────────────────────────────────────────────────

function loadTickets() {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws);
  return rows.map((r, i) => ({
    id: `t${i + 1}`,
    person: r["Kontonamn"] || "Okänd",
    tags: [r["SAB/Pren"]?.trim() || "Okänd"],
    text: r["Ärenderubrik"] || "",
  }));
}

// ── Chunk helper ─────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ── Build prompt (matches local-detect-patterns.ts) ──────────────────

function buildPrompt(
  challenges: { id: string; person: string; tags: string[]; text: string }[],
  existingTitles: string[],
  batchNum: number,
  totalBatches: number
): string {
  const challengeTexts = challenges
    .map((c, i) => `${i + 1}. [id:${c.id}] Person: ${c.person} | Taggar: ${c.tags.join(", ")} | "${c.text}"`)
    .join("\n");

  const ctx = "Kontext om datan: Supportärenden från HPTS (Hogia Public Transport Systems) — kollektivtrafikens IT-system inkl. TIMS, PubTrans, TransitCloud, OCA, InGrid, Instant, Rakel.\n\n";

  return `${ctx}Du analyserar utmaningar som fångats i teammöten. Identifiera mönster — problem som är återkommande, eskalerande, eller delas av flera personer/team.

REGLER:
- Kräv minst 2 challenges per mönster
- Varje challenge ska bara tillhöra ETT mönster (det mest relevanta)
- Skapa INTE dubbletter av befintliga mönster
- Var restriktiv — skapa bara mönster med tydlig tematisk koppling
- Om inga mönster finns, returnera tom array []

Befintliga mönster (skapa inte dubbletter): ${existingTitles.join(", ") || "(inga)"}

Utmaningar (batch ${batchNum}/${totalBatches}):
${challengeTexts}

Returnera JSON-array (inga kommentarer i JSON):
[{
  "title": "Kort titel",
  "description": "Förklaring av mönstret",
  "patternType": "<välj exakt EN av: RECURRING, ESCALATING, CROSS_PERSON, CROSS_TEAM>",
  "challengeIds": ["id1", "id2"],
  "suggestion": "En konkret åtgärd"
}]`;
}

// ── Call LLM ─────────────────────────────────────────────────────────

type DetectedPattern = {
  title: string;
  description: string;
  patternType: string;
  challengeIds: string[];
  suggestion: string;
};

async function callLLM(prompt: string): Promise<{ patterns: DetectedPattern[]; raw: string; durationMs: number; parseError?: string }> {
  const start = Date.now();
  const res = await fetch(`${LOCAL_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4000,
      temperature: 0.3,
      stream: false,
    }),
  });
  const data = await res.json();
  const durationMs = Date.now() - start;
  const raw = data.choices?.[0]?.message?.content ?? "";

  try {
    const match = raw.match(/\[[\s\S]*\]/);
    const cleaned = match ? match[0].replace(/\/\/[^\n]*/g, "") : null;
    const patterns: DetectedPattern[] = cleaned ? JSON.parse(cleaned) : [];
    return { patterns, raw, durationMs };
  } catch (e) {
    return { patterns: [], raw, durationMs, parseError: String(e) };
  }
}

// ── Analysis ─────────────────────────────────────────────────────────

const VALID_TYPES = new Set(["RECURRING", "ESCALATING", "CROSS_PERSON", "CROSS_TEAM"]);

function analyzeResults(allPatterns: DetectedPattern[], totalTickets: number, validIds: Set<string>) {
  const lines: string[] = [];

  // Basic counts
  lines.push(`Totalt ${allPatterns.length} mönster detekterade från ${totalTickets} ärenden`);

  // Coverage
  const coveredIds = new Set<string>();
  for (const p of allPatterns) for (const id of p.challengeIds) coveredIds.add(id);
  const validCovered = [...coveredIds].filter((id) => validIds.has(id));
  lines.push(`Täckning: ${validCovered.length}/${totalTickets} ärenden (${Math.round(validCovered.length / totalTickets * 100)}%)`);

  // Hallucinated IDs
  const hallucinated = [...coveredIds].filter((id) => !validIds.has(id));
  if (hallucinated.length > 0) {
    lines.push(`⚠ ${hallucinated.length} hallucinerade ID:n (refererar ärenden som inte finns)`);
  }

  // Invalid types
  const invalidTypes = allPatterns.filter((p) => !VALID_TYPES.has(p.patternType));
  if (invalidTypes.length > 0) {
    lines.push(`⚠ ${invalidTypes.length} mönster med ogiltigt patternType:`);
    for (const p of invalidTypes) lines.push(`  "${p.title}" → ${p.patternType}`);
  } else {
    lines.push(`✓ Alla patternType-värden giltiga`);
  }

  // Duplicates (title similarity)
  const dupes: string[] = [];
  for (let i = 0; i < allPatterns.length; i++) {
    for (let j = i + 1; j < allPatterns.length; j++) {
      const a = allPatterns[i].title.toLowerCase();
      const b = allPatterns[j].title.toLowerCase();
      // Simple word overlap check
      const aWords = new Set(a.split(/\s+/).filter((w) => w.length > 3));
      const bWords = new Set(b.split(/\s+/).filter((w) => w.length > 3));
      const overlap = [...aWords].filter((w) => bWords.has(w)).length;
      const smaller = Math.min(aWords.size, bWords.size);
      if (smaller > 0 && overlap / smaller > 0.5) {
        dupes.push(`"${allPatterns[i].title}" ↔ "${allPatterns[j].title}" (${overlap} gemensamma ord)`);
      }
    }
  }
  if (dupes.length > 0) {
    lines.push(`⚠ ${dupes.length} potentiella dubbletter:`);
    for (const d of dupes) lines.push(`  ${d}`);
  } else {
    lines.push(`✓ Inga dubbletter detekterade`);
  }

  // Challenge reuse (same challenge in multiple patterns)
  const challengeUsage: Record<string, string[]> = {};
  for (const p of allPatterns) {
    for (const id of p.challengeIds) {
      if (!challengeUsage[id]) challengeUsage[id] = [];
      challengeUsage[id].push(p.title);
    }
  }
  const overused = Object.entries(challengeUsage).filter(([, titles]) => titles.length > 1);
  if (overused.length > 0) {
    lines.push(`⚠ ${overused.length} ärenden tilldelade flera mönster:`);
    for (const [id, titles] of overused.slice(0, 10)) {
      lines.push(`  ${id} → ${titles.join(" | ")}`);
    }
    if (overused.length > 10) lines.push(`  ... och ${overused.length - 10} till`);
  } else {
    lines.push(`✓ Varje ärende tilldelat max ett mönster`);
  }

  // Pattern size distribution
  const sizes = allPatterns.map((p) => p.challengeIds.length).sort((a, b) => b - a);
  lines.push(`\nMönsterstorlekar: min=${sizes[sizes.length - 1]}, max=${sizes[0]}, median=${sizes[Math.floor(sizes.length / 2)]}, avg=${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}`);

  // Type distribution
  const typeCount: Record<string, number> = {};
  for (const p of allPatterns) typeCount[p.patternType] = (typeCount[p.patternType] || 0) + 1;
  lines.push(`Typfördelning: ${Object.entries(typeCount).map(([t, c]) => `${t}=${c}`).join(", ")}`);

  return lines;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Real Data Eval — HPTS Skapade ärenden (265 st)             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const tickets = loadTickets();
  console.log(`Laddat ${tickets.length} ärenden\n`);

  const BATCH_SIZE = 50;
  const batches = chunk(tickets, BATCH_SIZE);
  const allPatterns: DetectedPattern[] = [];
  const validIds = new Set(tickets.map((t) => t.id));
  let totalDuration = 0;
  let parseErrors = 0;

  for (let i = 0; i < batches.length; i++) {
    const existingTitles = allPatterns.map((p) => p.title);
    const prompt = buildPrompt(batches[i], existingTitles, i + 1, batches.length);

    process.stdout.write(`Batch ${i + 1}/${batches.length} (${batches[i].length} ärenden)... `);
    const { patterns, durationMs, parseError } = await callLLM(prompt);
    totalDuration += durationMs;

    if (parseError) {
      console.log(`⚠ Parse-fel: ${parseError}`);
      parseErrors++;
    } else {
      // Filter to valid IDs only
      for (const p of patterns) {
        p.challengeIds = p.challengeIds.filter((id) => validIds.has(id));
        if (p.challengeIds.length >= 2) {
          // Check not duplicate title
          if (!allPatterns.some((ep) => ep.title.toLowerCase() === p.title.toLowerCase())) {
            allPatterns.push(p);
          }
        }
      }
      console.log(`${patterns.length} mönster (${(durationMs / 1000).toFixed(1)}s)`);
    }
  }

  // Results
  console.log("\n" + "═".repeat(62));
  console.log("RESULTAT");
  console.log("═".repeat(62));
  console.log(`Total tid: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`Parse-fel: ${parseErrors}/${batches.length} batchar\n`);

  const analysis = analyzeResults(allPatterns, tickets.length, validIds);
  for (const line of analysis) console.log(line);

  // Print all patterns
  console.log("\n" + "═".repeat(62));
  console.log("ALLA MÖNSTER");
  console.log("═".repeat(62));
  for (const p of allPatterns) {
    console.log(`\n[${p.patternType}] ${p.title} (${p.challengeIds.length} ärenden)`);
    console.log(`  ${p.description}`);
    console.log(`  Förslag: ${p.suggestion}`);
  }

  // Score summary
  const coverage = [...new Set(allPatterns.flatMap((p) => p.challengeIds))].filter((id) => validIds.has(id)).length;
  const invalidTypes = allPatterns.filter((p) => !VALID_TYPES.has(p.patternType)).length;
  const score = {
    patterns: allPatterns.length,
    coverage: `${coverage}/${tickets.length} (${Math.round(coverage / tickets.length * 100)}%)`,
    invalidTypes,
    parseErrors,
    totalDurationS: Math.round(totalDuration / 1000),
  };

  console.log("\n" + "═".repeat(62));
  console.log("SAMMANFATTNING");
  console.log("═".repeat(62));
  console.log(JSON.stringify(score, null, 2));

  // Save
  writeFileSync(
    "/Users/evil/Desktop/EVIL/PROJEKT/worktemp/eval-real-data.json",
    JSON.stringify({ timestamp: new Date().toISOString(), score, patterns: allPatterns }, null, 2)
  );
  console.log("\nSparad: eval-real-data.json");
}

main().catch(console.error);
