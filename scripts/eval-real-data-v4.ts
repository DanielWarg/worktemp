/**
 * Eval on real HPTS data — v4 pipeline with threshold sweep + purity metrics.
 *
 * Usage:
 *   npx tsx scripts/eval-real-data-v4.ts                     # Full v4 run (deterministic)
 *   npx tsx scripts/eval-real-data-v4.ts --sweep              # Threshold sweep [0.36..0.45]
 *   npx tsx scripts/eval-real-data-v4.ts --polish qwen2.5-7b  # With title polish
 *   npx tsx scripts/eval-real-data-v4.ts --compare            # Compare v4 vs v3 results
 */

import * as XLSX from "xlsx";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { config } from "dotenv";
import { embedChallenges, type ChallengeForEmbed } from "../lib/ai/embed-challenges";
import { clusterChallenges, type ClusterOptions } from "../lib/ai/cluster-challenges";
import { classifyTicket, findDuplicates, type TicketClass } from "../lib/ai/pre-classify";
import { extractCorpusTopics, aggregateClusterTopics } from "../lib/ai/topic-extract";
import { deduplicatePatterns } from "../lib/ai/pattern-dedup";
import { calcTrend, calcScopeByOrg, calcConfidence, type TrendType, type ScopeType, type ConfidenceLevel } from "../lib/ai/trend-calc";
import { polishWithSuggestions, type PatternForPolish } from "../lib/ai/title-polish";

config({ path: new URL("../.env.local", import.meta.url).pathname });
config({ path: new URL("../.env", import.meta.url).pathname });

const XLSX_PATH = "/Users/evil/Downloads/Skapade ärenden förra månaden 2026_03_13 11-06-2 8.xlsx";

// Parse flags
const SWEEP = process.argv.includes("--sweep");
const COMPARE = process.argv.includes("--compare");
const polishIdx = process.argv.indexOf("--polish");
const POLISH_MODEL = polishIdx >= 0 ? (process.argv[polishIdx + 1] || "none") : "none";

type Ticket = { id: string; person: string; org: string; tags: string[]; text: string };

function loadTickets(): Ticket[] {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws);
  return rows.map((r, i) => ({
    id: `t${i + 1}`,
    person: r["Kontonamn"] || "Okänd",
    org: r["Organisation"] || r["Företag"] || "",
    tags: [r["SAB/Pren"]?.trim() || "Okänd"],
    text: r["Ärenderubrik"] || "",
  }));
}

type PatternResult = {
  title: string;
  description: string;
  patternType: string;
  ticketIds: string[];
  topics: string[];
  scope: ScopeType;
  trend: TrendType;
  confidence: ConfidenceLevel;
  evidence: { text: string; person: string }[];
};

async function runPipeline(tickets: Ticket[], coreTickets: Ticket[], clusterOpts: ClusterOptions) {
  // ─── Step 2: Embed ───
  const embedStart = Date.now();
  const forEmbed: ChallengeForEmbed[] = coreTickets.map((t) => ({
    id: t.id, text: t.text, tags: t.tags,
    // person intentionally omitted
  }));
  const embeddings = await embedChallenges(forEmbed);
  const embedMs = Date.now() - embedStart;

  // ─── Step 3: Cluster ───
  const clusterItems = coreTickets.map((t) => ({ id: t.id }));
  const clusters = clusterChallenges(clusterItems, embeddings, clusterOpts);

  // ─── Step 4: Topic extraction ───
  const corpusInput = coreTickets.map((t) => ({ id: t.id, text: t.text, tags: t.tags }));
  const ticketTopics = extractCorpusTopics(corpusInput);

  // Filter to meaningful groups
  const meaningfulGroups = clusters.filter((g) => g.length >= 2);

  // Build cluster topics
  const clusterTopicsList: string[][] = meaningfulGroups.map((group) =>
    aggregateClusterTopics(ticketTopics, group.map((item) => item.id))
  );

  // ─── Step 5: Dedup ───
  type PrePattern = { ticketIds: string[]; topics: string[]; groupIdx: number };
  let prePatterns: PrePattern[] = meaningfulGroups.map((group, i) => ({
    ticketIds: group.map((item) => item.id),
    topics: clusterTopicsList[i],
    groupIdx: i,
  }));

  const beforeDedup = prePatterns.length;
  prePatterns = deduplicatePatterns(prePatterns, embeddings);
  const mergeCount = beforeDedup - prePatterns.length;

  // ─── Step 6: Metadata ───
  const ticketPersons = new Map<string, string>();
  const ticketOrgs = new Map<string, string>();
  const ticketTextsMap = new Map<string, string>();
  for (const t of coreTickets) {
    ticketPersons.set(t.id, t.person);
    ticketOrgs.set(t.id, t.org);
    ticketTextsMap.set(t.id, t.text);
  }

  const patterns: PatternResult[] = [];
  for (const pp of prePatterns) {
    const topics = pp.topics.length > 0
      ? pp.topics
      : aggregateClusterTopics(ticketTopics, pp.ticketIds);

    // Title from topics — prefer proper nouns + action words
    const ticketTextsForTitle = pp.ticketIds.map((id) => ticketTextsMap.get(id) || "").filter(Boolean);
    const title = buildTitle(topics, ticketTextsForTitle, pp.ticketIds.length);

    const uniqueOrgs = new Set(pp.ticketIds.map((id) => ticketOrgs.get(id)).filter((o): o is string => !!o && o.length > 0));
    const uniquePersons = new Set(pp.ticketIds.map((id) => ticketPersons.get(id)).filter(Boolean));
    const scope = calcScopeByOrg(uniqueOrgs.size, uniquePersons.size);
    const trend = calcTrend([]); // No dates in eval data
    const confidence = calcConfidence(pp.ticketIds.length, topics.length > 0);

    const evidence = pp.ticketIds.slice(0, 3).map((id) => ({
      text: ticketTextsMap.get(id) || "",
      person: ticketPersons.get(id) || "Okänd",
    }));

    const description = [
      `${pp.ticketIds.length} ärenden`,
      topics.length > 0 ? `Ämnen: ${topics.slice(0, 5).join(", ")}` : null,
      `Scope: ${scope}`,
    ].filter(Boolean).join(". ") + ".";

    let patternType: string;
    if (trend === "ESCALATING") patternType = "ESCALATING";
    else if (scope === "CROSS_TEAM") patternType = "CROSS_TEAM";
    else if (scope === "CROSS_PERSON") patternType = "CROSS_PERSON";
    else patternType = "RECURRING";

    patterns.push({
      title, description, patternType,
      ticketIds: pp.ticketIds,
      topics: topics.slice(0, 5),
      scope, trend, confidence, evidence,
    });
  }

  // Dedup titles
  const titleCount = new Map<string, number>();
  for (const p of patterns) titleCount.set(p.title, (titleCount.get(p.title) || 0) + 1);
  const titleSeen = new Map<string, number>();
  for (const p of patterns) {
    if ((titleCount.get(p.title) || 0) > 1) {
      const idx = (titleSeen.get(p.title) || 0) + 1;
      titleSeen.set(p.title, idx);
      const tp = p.evidence[0]?.person;
      if (tp && idx <= 2) p.title = `${p.title} (${tp})`;
      else p.title = `${p.title} #${idx}`;
    }
  }

  return { embeddings, embedMs, clusters, patterns, mergeCount, ticketTopics, ticketTextsMap };
}

function computeMetrics(patterns: PatternResult[], coreTickets: Ticket[]) {
  const coveredIds = new Set(patterns.flatMap((p) => p.ticketIds));
  const coverage = coveredIds.size / coreTickets.length;
  const orphanRate = 1 - coverage;
  const sizes = patterns.map((p) => p.ticketIds.length).sort((a, b) => b - a);
  const catchAll = patterns.filter((p) => p.ticketIds.length > 15);

  const scopeC: Record<string, number> = {};
  const confC: Record<string, number> = {};
  for (const p of patterns) {
    scopeC[p.scope] = (scopeC[p.scope] || 0) + 1;
    confC[p.confidence] = (confC[p.confidence] || 0) + 1;
  }

  return {
    patternCount: patterns.length,
    coverage: Math.round(coverage * 100),
    orphanRate: Math.round(orphanRate * 100),
    avgSize: sizes.length > 0 ? +(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1) : 0,
    maxSize: sizes[0] || 0,
    minSize: sizes[sizes.length - 1] || 0,
    catchAllCount: catchAll.length,
    scope: scopeC,
    confidence: confC,
  };
}

async function sweepThresholds(tickets: Ticket[], coreTickets: Ticket[]) {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  V4 Threshold Sweep                                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const thresholds = [0.36, 0.39, 0.42, 0.45];
  const results: { threshold: number; metrics: ReturnType<typeof computeMetrics>; mergeCount: number }[] = [];

  for (const threshold of thresholds) {
    console.log(`\n── Threshold: ${threshold} ──`);
    const opts: ClusterOptions = { similarityThreshold: threshold };
    const { patterns, mergeCount } = await runPipeline(tickets, coreTickets, opts);
    const metrics = computeMetrics(patterns, coreTickets);
    results.push({ threshold, metrics, mergeCount });

    console.log(`  Patterns: ${metrics.patternCount} | Coverage: ${metrics.coverage}% | Orphans: ${metrics.orphanRate}%`);
    console.log(`  Avg size: ${metrics.avgSize} | Max: ${metrics.maxSize} | Catch-all: ${metrics.catchAllCount}`);
    console.log(`  Dedup merges: ${mergeCount}`);
    console.log(`  Scope: ${Object.entries(metrics.scope).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  console.log("\n\n═══ SWEEP SUMMARY ═══");
  console.log("Threshold | Patterns | Coverage | Orphans | Avg Size | Max | Catch-all | Merges");
  console.log("----------|----------|----------|---------|----------|-----|-----------|-------");
  for (const r of results) {
    console.log(
      `${r.threshold.toFixed(2).padStart(9)} | ${String(r.metrics.patternCount).padStart(8)} | ${String(r.metrics.coverage + "%").padStart(8)} | ${String(r.metrics.orphanRate + "%").padStart(7)} | ${String(r.metrics.avgSize).padStart(8)} | ${String(r.metrics.maxSize).padStart(3)} | ${String(r.metrics.catchAllCount).padStart(9)} | ${String(r.mergeCount).padStart(6)}`
    );
  }

  // Pick optimal: highest coverage with no catch-all, or least catch-all
  const optimal = results
    .sort((a, b) => {
      if (a.metrics.catchAllCount !== b.metrics.catchAllCount) return a.metrics.catchAllCount - b.metrics.catchAllCount;
      return b.metrics.coverage - a.metrics.coverage;
    })[0];
  console.log(`\n→ Optimal threshold: ${optimal.threshold} (${optimal.metrics.patternCount} patterns, ${optimal.metrics.coverage}% coverage, ${optimal.metrics.catchAllCount} catch-all)`);
}

async function main() {
  const tickets = loadTickets();

  // ─── Step 1: Filter ───
  const classifications = new Map<string, { ticketClass: TicketClass; isNoise: boolean }>();
  for (const t of tickets) classifications.set(t.id, classifyTicket(t.text, t.tags));
  const duplicateIds = findDuplicates(tickets.map((t) => ({ id: t.id, text: t.text, person: t.person })));
  for (const id of duplicateIds) classifications.set(id, { ticketClass: "duplicate_candidate", isNoise: true });
  const coreTickets = tickets.filter((t) => !classifications.get(t.id)?.isNoise);

  if (SWEEP) {
    await sweepThresholds(tickets, coreTickets);
    return;
  }

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Pipeline v4 — Multilingual, Domain-Agnostic, Dedup-Aware ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`Laddat ${tickets.length} ärenden\n`);

  const t0 = Date.now();

  console.log(`Step 1: ${tickets.length} → ${coreTickets.length} core\n`);
  if (coreTickets.length < 3) { console.log("För få ärenden."); return; }

  const opts: ClusterOptions = {}; // Use defaults (0.42 threshold)
  const { embedMs, clusters, patterns, mergeCount, ticketTextsMap } = await runPipeline(tickets, coreTickets, opts);

  // ─── Title polish (optional) ───
  let llmCalls = 0;
  let polishFallbacks = 0;

  if (POLISH_MODEL !== "none") {
    console.log(`\nStep 7: Title polish via ${POLISH_MODEL}...`);
    const chatFn = await buildChatFn(POLISH_MODEL);

    const forPolish: PatternForPolish[] = patterns.map((p) => ({
      title: p.title,
      entities: p.topics,
      ticketCount: p.ticketIds.length,
      evidence: p.evidence,
      allTicketTexts: p.ticketIds.map((id) => ticketTextsMap.get(id) || "").filter(Boolean),
    }));

    const polished = await polishWithSuggestions(forPolish, chatFn);
    llmCalls = polished.length;

    for (let i = 0; i < patterns.length; i++) {
      if (!polished[i].fallbackUsed) {
        console.log(`  "${patterns[i].title}" → "${polished[i].polished}"`);
        patterns[i].title = polished[i].polished;
      } else {
        polishFallbacks++;
      }
    }
    console.log(`  ${patterns.length - polishFallbacks}/${patterns.length} polished, ${polishFallbacks} fallbacks`);
  }

  const elapsed = Date.now() - t0;

  // ─── Results ───
  console.log(`\n  ${patterns.length} patterns\n`);
  console.log("═".repeat(62));
  console.log("RESULTAT");
  console.log("═".repeat(62));
  console.log(`Tid: ${(elapsed / 1000).toFixed(1)}s total (embed: ${(embedMs / 1000).toFixed(1)}s)`);
  console.log(`LLM: ${llmCalls} calls (title polish: ${POLISH_MODEL})${polishFallbacks ? `, ${polishFallbacks} fallbacks` : ""}`);
  console.log(`Dedup: ${mergeCount} patterns merged\n`);

  const metrics = computeMetrics(patterns, coreTickets);
  console.log(`Täckning: ${metrics.coverage}% | Orphans: ${metrics.orphanRate}%`);

  const catchAll = patterns.filter((p) => p.ticketIds.length > 15);
  console.log(catchAll.length
    ? `⚠ ${catchAll.length} catch-all (>15): ${catchAll.map((p) => `"${p.title}" (${p.ticketIds.length})`).join(", ")}`
    : `✓ Inga catch-all (alla ≤15 tickets)`
  );

  // Ticket reuse
  const usage: Record<string, number> = {};
  for (const p of patterns) for (const id of p.ticketIds) usage[id] = (usage[id] || 0) + 1;
  const reused = Object.values(usage).filter((c) => c > 1).length;
  console.log(reused ? `⚠ ${reused} ärenden i flera mönster` : `✓ Varje ärende i max ett mönster`);

  // Distributions
  console.log(`\nStorlekar: min=${metrics.minSize} max=${metrics.maxSize} avg=${metrics.avgSize}`);
  console.log(`Scope: ${Object.entries(metrics.scope).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`Confidence: ${Object.entries(metrics.confidence).map(([c, n]) => `${c}=${n}`).join(", ")}`);

  const withTopics = patterns.filter((p) => p.topics.length > 0).length;
  console.log(`Topics: ${withTopics}/${patterns.length} patterns with topics`);

  // ─── Cluster purity: show all ticket titles per pattern ───
  console.log("\n" + "═".repeat(62));
  console.log("CLUSTER PURITY (alla ärenden per mönster)");
  console.log("═".repeat(62));
  for (const p of patterns) {
    console.log(`\n[${p.scope}] ${p.title} (${p.ticketIds.length} ärenden)`);
    console.log(`  Topics: ${p.topics.join(", ") || "—"}`);
    for (const id of p.ticketIds) {
      const text = ticketTextsMap.get(id) || "?";
      const person = coreTickets.find((t) => t.id === id)?.person || "?";
      console.log(`    ${id}: "${text}" (${person})`);
    }
  }

  // ─── A/B comparison with v3 ───
  if (COMPARE) {
    const v3File = "/Users/evil/Desktop/EVIL/PROJEKT/worktemp/eval-real-data-v3.json";
    if (existsSync(v3File)) {
      const v3Data = JSON.parse(readFileSync(v3File, "utf8"));
      console.log("\n" + "═".repeat(62));
      console.log("V3 vs V4 JÄMFÖRELSE");
      console.log("═".repeat(62));
      console.log(`                  V3        V4`);
      console.log(`Patterns:     ${String(v3Data.score.patterns).padStart(6)}    ${String(patterns.length).padStart(6)}`);
      console.log(`Coverage:     ${String(v3Data.score.coverage).padStart(6)}    ${String(metrics.coverage + "%").padStart(6)}`);
      console.log(`Catch-all:    ${String(v3Data.score.catchAll).padStart(6)}    ${String(metrics.catchAllCount).padStart(6)}`);
      console.log(`Max size:     ${String(v3Data.score.maxGroupSize).padStart(6)}    ${String(metrics.maxSize).padStart(6)}`);
      console.log(`Dedup merges: ${String(0).padStart(6)}    ${String(mergeCount).padStart(6)}`);

      // Side-by-side titles
      console.log("\nTITLAR V3:");
      for (const p of v3Data.patterns) {
        console.log(`  ${p.title} (${p.ticketCount})`);
      }
      console.log("\nTITLAR V4:");
      for (const p of patterns) {
        console.log(`  ${p.title} (${p.ticketIds.length})`);
      }
    } else {
      console.log("\n⚠ V3 results not found. Run: npx tsx scripts/eval-real-data-v3.ts");
    }
  }

  // Save results
  const score = {
    pipeline: "v4",
    totalTickets: tickets.length,
    noiseFiltered: tickets.length - coreTickets.length,
    coreTickets: coreTickets.length,
    patterns: patterns.length,
    coverage: `${metrics.coverage}%`,
    orphanRate: `${metrics.orphanRate}%`,
    catchAll: metrics.catchAllCount,
    maxGroupSize: metrics.maxSize,
    dedupMerged: mergeCount,
    totalDurationMs: elapsed,
    polishModel: POLISH_MODEL,
    llmCalls,
    polishFallbacks,
    clusters: clusters.length,
    scope: metrics.scope,
    confidence: metrics.confidence,
  };

  console.log("\n" + "═".repeat(62));
  console.log("SAMMANFATTNING");
  console.log("═".repeat(62));
  console.log(JSON.stringify(score, null, 2));

  const outFile = POLISH_MODEL !== "none" ? `eval-real-data-v4-${POLISH_MODEL}.json` : "eval-real-data-v4.json";
  writeFileSync(
    `/Users/evil/Desktop/EVIL/PROJEKT/worktemp/${outFile}`,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      score,
      patterns: patterns.map((p) => ({
        title: p.title,
        description: p.description,
        patternType: p.patternType,
        scope: p.scope,
        trend: p.trend,
        confidence: p.confidence,
        topics: p.topics,
        evidence: p.evidence,
        ticketCount: p.ticketIds.length,
        ticketIds: p.ticketIds,
      })),
    }, null, 2)
  );
  console.log(`\nSparad: ${outFile}`);
}

// ─── Title builder (mirrors pattern-detect-v4.ts logic) ───

const ACTION_WORDS = new Set([
  "saknas", "fel", "fungerar", "funkar", "problem", "trasig",
  "kraschar", "hänger", "timeout", "långsam", "nere", "avbrott",
  "inloggning", "behörighet", "import", "export", "uppgradering",
  "installation", "konfiguration", "migration", "byte",
  "missing", "error", "broken", "failed", "unavailable",
  "felanmälan", "störning", "driftstörning",
]);

function isProperNounTopic(topic: string): boolean {
  if (topic.includes(" ")) return false;
  if (/^[A-ZÄÖÅ][A-ZÄÖÅ0-9]{2,}$/.test(topic)) return true;
  if (/^[A-ZÄÖÅ][a-zäöå]+[A-ZÄÖÅ]/.test(topic)) return true;
  if (/^[A-ZÄÖÅ][a-zäöå]{2,}$/.test(topic)) return true;
  return false;
}

function findActionWord(texts: string[]): string {
  const freq = new Map<string, number>();
  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const action of ACTION_WORDS) {
      if (lower.includes(action)) freq.set(action, (freq.get(action) || 0) + 1);
    }
  }
  const threshold = Math.ceil(texts.length * 0.3);
  const best = [...freq.entries()].filter(([, c]) => c >= threshold).sort((a, b) => b[1] - a[1]);
  return best[0]?.[0] || "";
}

function buildTitle(topics: string[], texts: string[], ticketCount: number): string {
  const properNouns = topics.filter((t) => isProperNounTopic(t));
  const otherTopics = topics.filter((t) => !isProperNounTopic(t));
  const action = findActionWord(texts);

  if (properNouns.length > 0 && action) return `${properNouns[0]} — ${action}`;
  if (properNouns.length > 0 && otherTopics.length > 0) return `${properNouns[0]} — ${otherTopics[0]}`;
  if (properNouns.length >= 2) return `${properNouns[0]} + ${properNouns[1]}`;
  if (properNouns.length > 0) return properNouns[0];
  if (topics.length >= 2) return `${topics[0]} — ${topics[1]}`;
  if (topics.length === 1) return topics[0];
  return `Mönster (${ticketCount} ärenden)`;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function buildChatFn(model: string): Promise<(msgs: ChatMessage[], maxTokens: number) => Promise<string>> {
  if (model === "claude") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    return async (msgs, maxTokens) => {
      const systemMsg = msgs.find((m) => m.role === "system");
      const userMsgs = msgs.filter((m) => m.role !== "system");
      const res = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system: systemMsg?.content || "",
        messages: userMsgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      });
      const block = res.content[0];
      return block.type === "text" ? block.text : "";
    };
  }

  if (model.startsWith("qwen2.5-")) {
    const { ollamaChat } = await import("../lib/ai/ollama-client");
    const tag = model.replace("-", ":");
    return (msgs, maxTokens) => ollamaChat(msgs, maxTokens, tag);
  }

  if (model === "ministral") {
    const { localChat } = await import("../lib/ai/local-client");
    process.env.LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || "http://127.0.0.1:8081";
    return (msgs, maxTokens) => localChat(msgs, maxTokens);
  }

  throw new Error(`Unknown polish model: ${model}. Use: claude, qwen2.5-7b, qwen2.5-3b, ministral`);
}

main().catch(console.error);
