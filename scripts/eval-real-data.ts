/**
 * Eval on real HPTS data — 265 tickets from "Skapade ärenden förra månaden"
 * Tests batching, deduplication, and quality at scale.
 *
 * Usage: npx tsx scripts/eval-real-data.ts
 */

import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import { config } from "dotenv";
import { embedChallenges, type ChallengeForEmbed } from "../lib/ai/embed-challenges";
import { clusterChallenges } from "../lib/ai/cluster-challenges";
import { classifyTicket, findDuplicates, buildBatchContext, type TicketClass } from "../lib/ai/pre-classify";

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
  totalBatches: number,
  classifications: Map<string, { ticketClass: TicketClass; isNoise: boolean }>
): string {
  const batchContext = buildBatchContext(challenges, classifications);

  const challengeTexts = challenges
    .map((c, i) => {
      const cls = classifications.get(c.id);
      const classTag = cls ? ` [${cls.ticketClass}]` : "";
      return `${i + 1}. [id:${c.id}]${classTag} Person: ${c.person} | Taggar: ${c.tags.join(", ")} | "${c.text}"`;
    })
    .join("\n");

  const ctx = "Kontext om datan: Supportärenden från HPTS (Hogia Public Transport Systems) — kollektivtrafikens IT-system inkl. TIMS, PubTrans, TransitCloud, OCA, InGrid, Instant, Rakel.\n\n";

  return `${ctx}Du analyserar utmaningar som fångats i teammöten. Identifiera mönster — problem som är återkommande, eskalerande, eller delas av flera personer/team.

${batchContext}

REGLER:
- Kräv minst 2 challenges per mönster
- Varje challenge ska bara tillhöra ETT mönster (det mest relevanta)
- Skapa INTE dubbletter av befintliga mönster
- Var restriktiv — skapa bara mönster med tydlig tematisk koppling
- Ärenden markerade [monitoring_alert] eller [duplicate_candidate] utgör sällan egna mönster — inkludera dem bara om de stärker ett reellt mönster
- Om inga mönster finns, returnera tom array []
- Ange confidence: "high" om tydlig evidens, "medium" om rimligt, "low" om svagt underlag

Befintliga mönster (skapa inte dubbletter): ${existingTitles.join(", ") || "(inga)"}

Utmaningar (batch ${batchNum}/${totalBatches}):
${challengeTexts}

Returnera JSON-array (inga kommentarer i JSON):
[{
  "title": "Kort titel",
  "description": "Förklaring av mönstret",
  "patternType": "<välj exakt EN av: RECURRING, ESCALATING, CROSS_PERSON, CROSS_TEAM>",
  "challengeIds": ["id1", "id2"],
  "evidence": "Konkret bevis: vilka titlar/system/personer som kopplar ihop dessa",
  "confidence": "<high, medium eller low>",
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
  evidence?: string;
  confidence?: string;
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

  // Confidence distribution
  const confCount: Record<string, number> = {};
  for (const p of allPatterns) {
    const conf = p.confidence || "unset";
    confCount[conf] = (confCount[conf] || 0) + 1;
  }
  lines.push(`Confidence: ${Object.entries(confCount).map(([c, n]) => `${c}=${n}`).join(", ")}`);

  return lines;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Real Data Eval — HPTS Skapade ärenden (265 st)             ║");
  console.log("║  Läge: " + (process.argv.includes("--no-cluster") ? "kronologisk" : "semantisk clustering") + "                                     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const tickets = loadTickets();
  console.log(`Laddat ${tickets.length} ärenden\n`);

  // Pre-classify all tickets deterministically
  const classifications = new Map<string, { ticketClass: TicketClass; isNoise: boolean }>();
  for (const t of tickets) {
    classifications.set(t.id, classifyTicket(t.text, t.tags));
  }
  const duplicateIds = findDuplicates(tickets.map((t) => ({ id: t.id, text: t.text, person: t.person })));
  for (const id of duplicateIds) {
    classifications.set(id, { ticketClass: "duplicate_candidate", isNoise: true });
  }

  // Log pre-classification stats
  const classStats = new Map<string, number>();
  let noiseTotal = 0;
  for (const [, cls] of classifications) {
    classStats.set(cls.ticketClass, (classStats.get(cls.ticketClass) || 0) + 1);
    if (cls.isNoise) noiseTotal++;
  }
  console.log(`Pre-klassificering: ${[...classStats.entries()].map(([k, v]) => `${k}=${v}`).join(", ")} (${noiseTotal} brus)\n`);

  const useClustering = !process.argv.includes("--no-cluster");

  let batches: typeof tickets[];
  if (useClustering) {
    console.log("Pre-clustering med Transformers.js embeddings...");
    const embedStart = Date.now();
    const forEmbed: ChallengeForEmbed[] = tickets.map((t) => ({
      id: t.id,
      text: t.text,
      tags: t.tags,
      person: t.person,
    }));
    const embeddings = await embedChallenges(forEmbed);
    const embedMs = Date.now() - embedStart;
    console.log(`Embedding: ${tickets.length} ärenden → ${embeddings.size} vektorer (${(embedMs / 1000).toFixed(1)}s)`);

    batches = clusterChallenges(tickets, embeddings);
    console.log(`Klustring: ${batches.length} semantiska kluster [${batches.map((b) => b.length).join(", ")}]\n`);
  } else {
    const BATCH_SIZE = 50;
    batches = chunk(tickets, BATCH_SIZE);
    console.log(`Kronologiska batchar: ${batches.length} × ${50}\n`);
  }

  const allPatterns: DetectedPattern[] = [];
  const validIds = new Set(tickets.map((t) => t.id));
  let totalDuration = 0;
  let parseErrors = 0;

  for (let i = 0; i < batches.length; i++) {
    const existingTitles = allPatterns.map((p) => p.title);
    const prompt = buildPrompt(batches[i], existingTitles, i + 1, batches.length, classifications);

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

  // Results before refine
  console.log("\n" + "═".repeat(62));
  console.log("RESULTAT (före refine)");
  console.log("═".repeat(62));
  console.log(`Total tid: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`Parse-fel: ${parseErrors}/${batches.length} batchar\n`);

  const analysisBefore = analyzeResults(allPatterns, tickets.length, validIds);
  for (const line of analysisBefore) console.log(line);

  // --- Refine step: self-critique + code-based dedup ---
  console.log("\n" + "═".repeat(62));
  console.log("REFINE — self-critique + dedup");
  console.log("═".repeat(62));

  const beforeCount = allPatterns.length;
  const refineStart = Date.now();

  // Step 1: AI self-critique
  if (allPatterns.length >= 2) {
    const patternsForReview = allPatterns
      .map((p, i) => `${i + 1}. "${p.title}" (${p.patternType}, ${p.challengeIds.length} ärenden)\n   Beskrivning: ${p.description}`)
      .join("\n");

    try {
      process.stdout.write("Self-critique... ");
      const critiqueRes = await fetch(`${LOCAL_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Du är en kvalitetsgranskare. Granska dessa AI-detekterade mönster och identifiera problem.

Mönster att granska:
${patternsForReview}

Kontrollera:
1. DUBBLETTER: Finns mönster som beskriver samma underliggande problem med olika titlar? Var extra uppmärksam på mönster som nämner samma system (t.ex. PubTrans, TIMS, TransitCloud).
2. STUFFING: Innehåller något mönster ärenden som inte hör dit?
3. KVALITET: Är beskrivningen tillräckligt specifik?

Returnera JSON-array (inga kommentarer):
[{
  "index": 0,
  "decision": "KEEP",
  "reason": "Tydligt och unikt mönster"
},
{
  "index": 1,
  "decision": "MERGE_INTO",
  "mergeIntoIndex": 0,
  "reason": "Beskriver samma problem som mönster 1"
},
{
  "index": 2,
  "decision": "DISCARD",
  "reason": "För vag beskrivning"
}]

Beslut per mönster: KEEP (behåll), MERGE_INTO (slå ihop med annat), DISCARD (ta bort).
Var konservativ — behåll hellre för många än för få. Slå bara ihop vid tydlig överlapp.`,
          }],
          max_tokens: 4000,
          temperature: 0.3,
          stream: false,
        }),
      });
      const critiqueData = await critiqueRes.json();
      const critiqueRaw = critiqueData.choices?.[0]?.message?.content ?? "";
      const critiqueMatch = critiqueRaw.match(/\[[\s\S]*\]/);
      const critiqueCleaned = critiqueMatch ? critiqueMatch[0].replace(/\/\/[^\n]*/g, "") : null;

      if (critiqueCleaned) {
        const critiques: { index: number; decision: string; mergeIntoIndex?: number; reason?: string }[] = JSON.parse(critiqueCleaned);

        // Apply merges
        for (const c of critiques) {
          if (
            c.decision === "MERGE_INTO" &&
            c.mergeIntoIndex != null &&
            c.mergeIntoIndex >= 0 && c.mergeIntoIndex < allPatterns.length &&
            c.index >= 0 && c.index < allPatterns.length &&
            c.index !== c.mergeIntoIndex
          ) {
            const target = allPatterns[c.mergeIntoIndex];
            const source = allPatterns[c.index];
            for (const id of source.challengeIds) {
              if (!target.challengeIds.includes(id)) target.challengeIds.push(id);
            }
            console.log(`  Merge: "${source.title}" → "${target.title}"`);
          }
        }

        const toRemove = new Set(
          critiques
            .filter((c) => c.decision === "MERGE_INTO" || c.decision === "DISCARD")
            .map((c) => c.index)
        );
        for (let i = allPatterns.length - 1; i >= 0; i--) {
          if (toRemove.has(i)) {
            if (critiques.find((c) => c.index === i)?.decision === "DISCARD") {
              console.log(`  Discard: "${allPatterns[i].title}"`);
            }
            allPatterns.splice(i, 1);
          }
        }

        const refineDuration = ((Date.now() - refineStart) / 1000).toFixed(1);
        console.log(`${critiques.length} granskade, ${toRemove.size} borttagna/mergade (${refineDuration}s)`);
        totalDuration += Date.now() - refineStart;
      }
    } catch (err) {
      console.log(`Self-critique misslyckades: ${err}`);
    }
  }

  // Step 2: Code-based deduplication
  let codeDeduped = 0;
  for (let i = allPatterns.length - 1; i >= 1; i--) {
    const titleA = allPatterns[i].title.toLowerCase().trim();
    for (let j = 0; j < i; j++) {
      const titleB = allPatterns[j].title.toLowerCase().trim();
      const wordsA = new Set(titleA.split(/\s+/));
      const wordsB = new Set(titleB.split(/\s+/));
      const overlap = Array.from(wordsA).filter((w: string) => wordsB.has(w)).length;
      const similarity = overlap / Math.max(wordsA.size, wordsB.size);

      if (titleA.includes(titleB) || titleB.includes(titleA) || similarity > 0.6) {
        for (const id of allPatterns[i].challengeIds) {
          if (!allPatterns[j].challengeIds.includes(id)) allPatterns[j].challengeIds.push(id);
        }
        console.log(`  Dedup: "${allPatterns[i].title}" → "${allPatterns[j].title}"`);
        allPatterns.splice(i, 1);
        codeDeduped++;
        break;
      }
    }
  }
  if (codeDeduped > 0) console.log(`Kodbaserad dedup: ${codeDeduped} mergade`);

  console.log(`\nRefine: ${beforeCount} → ${allPatterns.length} mönster (${beforeCount - allPatterns.length} borttagna)`);

  // Results after refine
  console.log("\n" + "═".repeat(62));
  console.log("RESULTAT (efter refine)");
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
    const conf = p.confidence ? ` [${p.confidence}]` : "";
    console.log(`\n[${p.patternType}]${conf} ${p.title} (${p.challengeIds.length} ärenden)`);
    console.log(`  ${p.description}`);
    if (p.evidence) console.log(`  Evidens: ${p.evidence}`);
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
    clusterMethod: useClustering ? "semantic" : "chronological",
    clusters: batches.length,
  };

  console.log("\n" + "═".repeat(62));
  console.log("SAMMANFATTNING");
  console.log("═".repeat(62));
  console.log(JSON.stringify(score, null, 2));

  // Save
  const suffix = useClustering ? "semantic" : "chronological";
  const outPath = `/Users/evil/Desktop/EVIL/PROJEKT/worktemp/eval-real-data-${suffix}.json`;
  writeFileSync(
    outPath,
    JSON.stringify({ timestamp: new Date().toISOString(), score, patterns: allPatterns }, null, 2)
  );
  console.log(`\nSparad: eval-real-data-${suffix}.json`);
}

main().catch(console.error);
