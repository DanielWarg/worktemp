/**
 * Eval on real HPTS data — micro-step pipeline v2.1
 *
 * Usage: npx tsx scripts/eval-real-data-v2.ts
 */

import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import { config } from "dotenv";
import { embedChallenges, type ChallengeForEmbed } from "../lib/ai/embed-challenges";
import { clusterChallenges } from "../lib/ai/cluster-challenges";
import { classifyTicket, findDuplicates, type TicketClass } from "../lib/ai/pre-classify";
import { extractThemes } from "../lib/ai/micro-steps/extract-themes";
import { assignTickets } from "../lib/ai/micro-steps/assign-tickets";
import { validateThemes } from "../lib/ai/micro-steps/validate-themes";
import { mergeThemesAcrossClusters } from "../lib/ai/micro-steps/merge-themes";
import { namePatterns } from "../lib/ai/micro-steps/name-patterns";
import { classifyPatterns } from "../lib/ai/micro-steps/classify-patterns";
import { writeEvidence } from "../lib/ai/micro-steps/write-evidence";

config({ path: new URL("../.env.local", import.meta.url).pathname });
config({ path: new URL("../.env", import.meta.url).pathname });

process.env.LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || "http://127.0.0.1:8081";

const XLSX_PATH = "/Users/evil/Downloads/Skapade ärenden förra månaden 2026_03_13 11-06-2 8.xlsx";
const SYSTEM_CONTEXT = "Supportärenden från HPTS (Hogia Public Transport Systems) — kollektivtrafikens IT-system inkl. TIMS, PubTrans, TransitCloud, OCA, InGrid, Instant, Rakel.";

type Ticket = { id: string; person: string; tags: string[]; text: string };

function loadTickets(): Ticket[] {
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

const VALID_TYPES = new Set(["RECURRING", "ESCALATING", "CROSS_PERSON", "CROSS_TEAM"]);
const SMALL_CLUSTER = 8;

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Micro-Step Pipeline v2.1 Eval — HPTS data                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const tickets = loadTickets();
  console.log(`Laddat ${tickets.length} ärenden\n`);

  // ─── Step 0 ───
  const classifications = new Map<string, { ticketClass: TicketClass; isNoise: boolean }>();
  for (const t of tickets) classifications.set(t.id, classifyTicket(t.text, t.tags));
  const duplicateIds = findDuplicates(tickets.map((t) => ({ id: t.id, text: t.text, person: t.person })));
  for (const id of duplicateIds) classifications.set(id, { ticketClass: "duplicate_candidate", isNoise: true });

  const classStats = new Map<string, number>();
  let noiseTotal = 0;
  for (const [, cls] of classifications) {
    classStats.set(cls.ticketClass, (classStats.get(cls.ticketClass) || 0) + 1);
    if (cls.isNoise) noiseTotal++;
  }
  console.log(`Pre-klassificering: ${[...classStats.entries()].map(([k, v]) => `${k}=${v}`).join(", ")} (${noiseTotal} brus)`);

  const coreTickets = tickets.filter((t) => !classifications.get(t.id)?.isNoise);
  console.log(`Step 0: ${tickets.length} → ${coreTickets.length} core\n`);

  if (coreTickets.length < 3) return;

  // ─── Step 1 ───
  console.log("Step 1: Embedding + clustering...");
  const embedStart = Date.now();
  const forEmbed: ChallengeForEmbed[] = coreTickets.map((t) => ({
    id: t.id, text: t.text, tags: t.tags, person: t.person,
  }));
  const embeddings = await embedChallenges(forEmbed);
  const embedMs = Date.now() - embedStart;
  console.log(`  ${embeddings.size} vektorer (${(embedMs / 1000).toFixed(1)}s)`);

  const clusterItems = coreTickets.map((t) => ({ id: t.id }));
  const clusters = clusterChallenges(clusterItems, embeddings);
  const smallCount = clusters.filter((c) => c.length <= SMALL_CLUSTER).length;
  console.log(`  ${clusters.length} clusters [${clusters.map((c) => c.length).join(",")}], ${smallCount} embed-only\n`);

  // Lookups
  const ticketTexts = new Map<string, string>();
  const ticketPersons = new Map<string, string>();
  const ticketTags = new Map<string, string[]>();
  const ticketDetails = new Map<string, { text: string; person: string; tags: string[] }>();
  const ticketMap = new Map<string, Ticket>();
  const validIds = new Set<string>();
  for (const t of coreTickets) {
    ticketTexts.set(t.id, t.text);
    ticketPersons.set(t.id, t.person);
    ticketTags.set(t.id, t.tags);
    ticketDetails.set(t.id, { text: t.text, person: t.person, tags: t.tags });
    ticketMap.set(t.id, t);
    validIds.add(t.id);
  }

  // ─── Steps 2-4 ───
  const pipelineStart = Date.now();
  let llmCalls = 0;
  let fallbacks = 0;

  type VT = { label: string; ticketIds: string[] };
  const clusterThemes: { clusterIndex: number; themes: VT[] }[] = [];

  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    const isSmall = cluster.length <= SMALL_CLUSTER;
    const ct = cluster.map((item) => {
      const t = ticketMap.get(item.id)!;
      return { id: t.id, text: t.text, tags: t.tags };
    });

    process.stdout.write(`  C${ci + 1}/${clusters.length} (${cluster.length}${isSmall ? " emb" : ""}): `);

    const { themes, fallbackUsed: fb2 } = await extractThemes(
      ct.map((t) => ({ text: t.text, tags: t.tags })), SYSTEM_CONTEXT
    );
    if (!isSmall) llmCalls++;
    if (fb2) fallbacks++;

    const { assignments, unassigned, fallbackUsed: fb3 } = await assignTickets(
      themes, ct.map((t) => ({ id: t.id, text: t.text })), embeddings, SYSTEM_CONTEXT
    );
    if (!isSmall) llmCalls++;
    if (fb3) fallbacks++;

    const validated = validateThemes(assignments, unassigned, embeddings, validIds);
    clusterThemes.push({ clusterIndex: ci, themes: validated });

    const n = validated.reduce((s, t) => s + t.ticketIds.length, 0);
    console.log(`${themes.length}→${validated.length} themes (${n} assigned)`);
  }

  // ─── Step 5 ───
  console.log(`\nStep 5: Merge (strict)...`);
  const before5 = clusterThemes.reduce((s, ct) => s + ct.themes.length, 0);
  const merged = await mergeThemesAcrossClusters(clusterThemes, ticketPersons, embeddings, ticketTags);
  console.log(`  ${before5} → ${merged.length} patterns\n`);

  if (merged.length === 0) return;

  // ─── Step 6 ───
  process.stdout.write("Step 6: Naming (batch=8)... ");
  const named = await namePatterns(merged, ticketTexts, SYSTEM_CONTEXT);
  llmCalls += Math.ceil(merged.length / 8);
  console.log(`${named.length} named`);

  // ─── Step 7 ───
  process.stdout.write("Step 7: Classify (scope+behavior, chunk=12)... ");
  const classified = await classifyPatterns(named, ticketPersons);
  llmCalls += Math.ceil(named.length / 12);
  console.log(`${classified.length} classified`);

  // ─── Step 8 ───
  process.stdout.write("Step 8: Evidence (structured, batch=5)... ");
  const evidenced = await writeEvidence(classified, ticketDetails, SYSTEM_CONTEXT);
  llmCalls += Math.ceil(classified.length / 5);
  console.log(`${evidenced.length} done\n`);

  const pipelineMs = Date.now() - pipelineStart;

  // ─── Results ───
  console.log("═".repeat(62));
  console.log("RESULTAT");
  console.log("═".repeat(62));
  console.log(`Tid: ${(pipelineMs / 1000).toFixed(1)}s pipeline + ${(embedMs / 1000).toFixed(1)}s embed = ${((pipelineMs + embedMs) / 1000).toFixed(1)}s total`);
  console.log(`LLM: ${llmCalls} calls (${fallbacks} fallbacks, ${smallCount} clusters skipped)\n`);

  const coveredIds = new Set(evidenced.flatMap((p) => p.ticketIds));
  const validCovered = [...coveredIds].filter((id) => validIds.has(id));
  console.log(`Täckning: ${validCovered.length}/${coreTickets.length} core (${Math.round(validCovered.length / coreTickets.length * 100)}%)`);

  const invalidTypes = evidenced.filter((p) => !VALID_TYPES.has(p.patternType));
  console.log(invalidTypes.length ? `⚠ ${invalidTypes.length} ogiltiga patternType` : `✓ Alla patternType giltiga`);

  // Duplicates
  let dupeCount = 0;
  for (let i = 0; i < evidenced.length; i++) {
    for (let j = i + 1; j < evidenced.length; j++) {
      const aW = new Set(evidenced[i].title.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
      const bW = new Set(evidenced[j].title.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
      const ovl = [...aW].filter((w) => bW.has(w)).length;
      const sm = Math.min(aW.size, bW.size);
      if (sm > 0 && ovl / sm > 0.5) {
        console.log(`  ⚠ "${evidenced[i].title}" ↔ "${evidenced[j].title}"`);
        dupeCount++;
      }
    }
  }
  console.log(dupeCount ? "" : `✓ Inga dubbletter`);

  // Ticket reuse
  const usage: Record<string, number> = {};
  for (const p of evidenced) for (const id of p.ticketIds) usage[id] = (usage[id] || 0) + 1;
  const reused = Object.values(usage).filter((c) => c > 1).length;
  console.log(reused ? `⚠ ${reused} ärenden i flera mönster` : `✓ Varje ärende i max ett mönster`);

  // Distributions
  const sizes = evidenced.map((p) => p.ticketIds.length).sort((a, b) => b - a);
  console.log(`\nStorlekar: min=${sizes[sizes.length - 1]} max=${sizes[0]} median=${sizes[Math.floor(sizes.length / 2)]} avg=${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}`);

  const scopeC: Record<string, number> = {};
  const behC: Record<string, number> = {};
  const confC: Record<string, number> = {};
  for (const p of evidenced) {
    scopeC[p.scopeType] = (scopeC[p.scopeType] || 0) + 1;
    behC[p.behaviorType] = (behC[p.behaviorType] || 0) + 1;
    confC[p.evidence.confidence] = (confC[p.evidence.confidence] || 0) + 1;
  }
  console.log(`Scope: ${Object.entries(scopeC).map(([t, c]) => `${t}=${c}`).join(", ")}`);
  console.log(`Behavior: ${Object.entries(behC).map(([t, c]) => `${t}=${c}`).join(", ")}`);
  console.log(`Confidence: ${Object.entries(confC).map(([c, n]) => `${c}=${n}`).join(", ")}`);

  const withEnt = evidenced.filter((p) => p.evidence.entities.length > 0).length;
  const totEnt = evidenced.reduce((s, p) => s + p.evidence.entities.length, 0);
  console.log(`Entities: ${withEnt}/${evidenced.length} patterns (${totEnt} total)`);

  // All patterns
  console.log("\n" + "═".repeat(62));
  console.log("ALLA MÖNSTER");
  console.log("═".repeat(62));
  for (const p of evidenced) {
    console.log(`\n[${p.scopeType}/${p.behaviorType}] [${p.evidence.confidence}] ${p.title} (${p.ticketIds.length} ärenden)`);
    console.log(`  ${p.description}`);
    if (p.evidence.entities.length) console.log(`  Entities: ${p.evidence.entities.join(", ")}`);
    console.log(`  Evidens: ${p.evidence.evidenceText}`);
    console.log(`  Förslag: ${p.suggestion}`);
  }

  // Summary JSON
  const score = {
    pipeline: "v2.1",
    totalTickets: tickets.length,
    noiseFiltered: tickets.length - coreTickets.length,
    coreTickets: coreTickets.length,
    patterns: evidenced.length,
    coverage: `${validCovered.length}/${coreTickets.length} (${Math.round(validCovered.length / coreTickets.length * 100)}%)`,
    invalidTypes: invalidTypes.length,
    duplicates: dupeCount,
    ticketReuse: reused,
    totalDurationS: Math.round((pipelineMs + embedMs) / 1000),
    llmCalls,
    fallbacks,
    clusters: clusters.length,
    smallClustersSkipped: smallCount,
    scope: scopeC,
    behavior: behC,
    confidence: confC,
    entities: totEnt,
  };

  console.log("\n" + "═".repeat(62));
  console.log("SAMMANFATTNING");
  console.log("═".repeat(62));
  console.log(JSON.stringify(score, null, 2));

  writeFileSync(
    "/Users/evil/Desktop/EVIL/PROJEKT/worktemp/eval-real-data-v2.json",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      score,
      patterns: evidenced.map((p) => ({
        title: p.title,
        description: p.description,
        scopeType: p.scopeType,
        behaviorType: p.behaviorType,
        patternType: p.patternType,
        evidence: p.evidence,
        suggestion: p.suggestion,
        ticketCount: p.ticketIds.length,
        ticketIds: p.ticketIds,
      })),
    }, null, 2)
  );
  console.log(`\nSparad: eval-real-data-v2.json`);
}

main().catch(console.error);
