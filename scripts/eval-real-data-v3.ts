/**
 * Eval on real data — deterministic pipeline v3 + optional title polish.
 *
 * Usage:
 *   npx tsx scripts/eval-real-data-v3.ts                    # No LLM (deterministic only)
 *   npx tsx scripts/eval-real-data-v3.ts --polish claude    # Title polish via Claude API
 *   npx tsx scripts/eval-real-data-v3.ts --polish gpt-oss   # Title polish via Ollama GPT-OSS
 *   npx tsx scripts/eval-real-data-v3.ts --polish ministral # Title polish via llama.cpp Ministral
 */

import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import { config } from "dotenv";
import { embedChallenges, type ChallengeForEmbed } from "../lib/ai/embed-challenges";
import { clusterChallenges } from "../lib/ai/cluster-challenges";
import { classifyTicket, findDuplicates, type TicketClass } from "../lib/ai/pre-classify";
import { extractEntities, extractEntitiesFromTags, mergeEntities, discoverCorpusEntities, type ExtractedEntities } from "../lib/ai/entity-extract";
import { subSplitCluster, type TicketWithEntities } from "../lib/ai/sub-split";
import { calcTrend, calcScope, calcConfidence, type TrendType, type ScopeType, type ConfidenceLevel } from "../lib/ai/trend-calc";
import { polishTitles, polishTitlesSequential, polishWithSuggestions, type PatternForPolish } from "../lib/ai/title-polish";

config({ path: new URL("../.env.local", import.meta.url).pathname });
config({ path: new URL("../.env", import.meta.url).pathname });

const XLSX_PATH = "/Users/evil/Downloads/Skapade ärenden förra månaden 2026_03_13 11-06-2 8.xlsx";

// Parse --polish flag
const polishIdx = process.argv.indexOf("--polish");
const POLISH_MODEL = polishIdx >= 0 ? (process.argv[polishIdx + 1] || "none") : "none";

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

type PatternResult = {
  title: string;
  description: string;
  patternType: string;
  ticketIds: string[];
  scope: ScopeType;
  trend: TrendType;
  confidence: ConfidenceLevel;
  entities: string[];
  evidence: { text: string; person: string }[];
};

function findCommonWords(texts: string[]): string {
  if (texts.length === 0) return "";
  const wordFreq = new Map<string, number>();
  for (const text of texts) {
    const words = new Set(text.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    for (const word of words) wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }
  const common = [...wordFreq.entries()]
    .filter(([, count]) => count >= Math.ceil(texts.length * 0.5))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);
  return common.join(" ");
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Pipeline v3 — Embedding-First, LLM-Last (0 LLM calls)    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const tickets = loadTickets();
  console.log(`Laddat ${tickets.length} ärenden\n`);

  const t0 = Date.now();

  // ─── Step 1: Filter ───
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
  console.log(`Step 1: ${tickets.length} → ${coreTickets.length} core\n`);

  if (coreTickets.length < 3) { console.log("För få ärenden."); return; }

  // ─── Step 2: Embed + cluster ───
  console.log("Step 2: Embedding + clustering...");
  const embedStart = Date.now();
  const forEmbed: ChallengeForEmbed[] = coreTickets.map((t) => ({
    id: t.id, text: t.text, tags: t.tags, person: t.person,
  }));
  const embeddings = await embedChallenges(forEmbed);
  const embedMs = Date.now() - embedStart;
  console.log(`  ${embeddings.size} vektorer (${(embedMs / 1000).toFixed(1)}s)`);

  const clusterItems = coreTickets.map((t) => ({ id: t.id }));
  const clusters = clusterChallenges(clusterItems, embeddings);
  console.log(`  ${clusters.length} clusters [${clusters.map((c) => c.length).join(",")}]\n`);

  // ─── Step 3: Entity extraction (corpus-aware) ───
  console.log("Step 3: Entity extraction (corpus-aware)...");
  const corpusInput = coreTickets.map((t) => ({ id: t.id, text: t.text, tags: t.tags }));
  const corpusEntities = discoverCorpusEntities(corpusInput);

  const ticketEntities = new Map<string, ExtractedEntities>();
  for (const t of coreTickets) {
    const textEntities = extractEntities(t.text);
    const tagEntities = extractEntitiesFromTags(t.tags);
    let merged = mergeEntities(textEntities, tagEntities);
    const discovered = corpusEntities.get(t.id) || [];
    if (discovered.length > 0) {
      merged = mergeEntities(merged, { systems: discovered, actions: [], signature: "" });
    }
    ticketEntities.set(t.id, merged);
  }
  const withEntities = [...ticketEntities.values()].filter((e) => e.systems.length > 0).length;
  console.log(`  ${withEntities}/${coreTickets.length} tickets med entity (corpus-discovered)\n`);

  // ─── Step 4: Sub-split large clusters ───
  console.log("Step 4: Sub-split large clusters...");
  const allGroups: TicketWithEntities[][] = [];
  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    const twes: TicketWithEntities[] = cluster.map((item) => {
      const t = coreTickets.find((ct) => ct.id === item.id)!;
      return {
        id: t.id,
        text: t.text,
        entities: ticketEntities.get(t.id) || { systems: [], actions: [], signature: "UNKNOWN" },
      };
    });
    const subGroups = subSplitCluster(twes, embeddings);
    if (subGroups.length > 1) {
      console.log(`  C${ci + 1} (${cluster.length}) → ${subGroups.length} sub-groups [${subGroups.map((g) => g.length).join(",")}]`);
    }
    allGroups.push(...subGroups);
  }

  const meaningfulGroups = allGroups.filter((g) => g.length >= 2);
  const maxSize = Math.max(...meaningfulGroups.map((g) => g.length));
  console.log(`  ${clusters.length} clusters → ${meaningfulGroups.length} groups (max: ${maxSize})\n`);

  // ─── Step 5: Pattern metadata ───
  console.log("Step 5: Pattern metadata...");
  const ticketPersons = new Map<string, string>();
  for (const t of coreTickets) ticketPersons.set(t.id, t.person);

  const patterns: PatternResult[] = [];
  for (const group of meaningfulGroups) {
    // Aggregate entities
    const groupSystems = new Map<string, number>();
    const groupActions = new Map<string, number>();
    for (const t of group) {
      for (const sys of t.entities.systems) groupSystems.set(sys, (groupSystems.get(sys) || 0) + 1);
      for (const act of t.entities.actions) groupActions.set(act, (groupActions.get(act) || 0) + 1);
    }

    const sortedSystems = [...groupSystems.entries()].sort((a, b) => b[1] - a[1]);
    const sortedActions = [...groupActions.entries()].sort((a, b) => b[1] - a[1]);
    const primarySystem = sortedSystems[0]?.[0];
    const primaryAction = sortedActions[0]?.[0];

    // Title with differentiators
    const secondarySystem = sortedSystems[1]?.[0];
    const keyword = findCommonWords(group.map((t) => t.text));
    const topPerson = [...new Set(group.map((t) => ticketPersons.get(t.id)).filter(Boolean))][0];

    let title: string;
    if (primarySystem && primaryAction) {
      title = `${primarySystem} — ${primaryAction}`;
    } else if (primarySystem && secondarySystem) {
      title = `${primarySystem} + ${secondarySystem}`;
    } else if (primarySystem && keyword) {
      title = `${primarySystem} — ${keyword}`;
    } else if (primarySystem && topPerson) {
      title = `${primarySystem} (${topPerson})`;
    } else if (primarySystem) {
      title = `${primarySystem} — relaterade ärenden`;
    } else if (primaryAction) {
      title = `${primaryAction} — blandade system`;
    } else if (keyword) {
      title = keyword;
    } else {
      title = `Kluster (${group.length} ärenden)`;
    }

    const uniquePersons = new Set(group.map((t) => ticketPersons.get(t.id)).filter(Boolean));
    const scope = calcScope(uniquePersons.size);
    const trend = calcTrend([]); // No dates in eval data — defaults to ISOLATED
    const hasSpecificEntity = primarySystem != null;
    const confidence = calcConfidence(group.length, hasSpecificEntity);

    const evidence = group.slice(0, 3).map((t) => ({
      text: t.text,
      person: ticketPersons.get(t.id) || "Okänd",
    }));

    const entityList = sortedSystems.map(([s, c]) => `${s} (${c})`).join(", ");
    const description = [
      `${group.length} ärenden`,
      entityList ? `System: ${entityList}` : null,
      `Scope: ${scope}`,
      `Rapportörer: ${[...uniquePersons].slice(0, 5).join(", ")}`,
    ].filter(Boolean).join(". ") + ".";

    // Map to patternType
    let patternType: string;
    if (trend === "ESCALATING") patternType = "ESCALATING";
    else if (scope === "CROSS_TEAM") patternType = "CROSS_TEAM";
    else if (scope === "CROSS_PERSON") patternType = "CROSS_PERSON";
    else patternType = "RECURRING";

    patterns.push({
      title, description, patternType,
      ticketIds: group.map((t) => t.id),
      scope, trend, confidence,
      entities: sortedSystems.map(([s]) => s),
      evidence,
    });
  }

  // Deduplicate titles
  const titleCount = new Map<string, number>();
  for (const p of patterns) titleCount.set(p.title, (titleCount.get(p.title) || 0) + 1);
  const titleSeen = new Map<string, number>();
  for (const p of patterns) {
    if ((titleCount.get(p.title) || 0) > 1) {
      const idx = (titleSeen.get(p.title) || 0) + 1;
      titleSeen.set(p.title, idx);
      const tp = p.evidence[0]?.person;
      if (tp && idx <= 2) {
        p.title = `${p.title} (${tp})`;
      } else {
        p.title = `${p.title} #${idx}`;
      }
    }
  }

  // ─── Step 6: Title polish (optional) ───
  let llmCalls = 0;
  let polishFallbacks = 0;

  if (POLISH_MODEL !== "none") {
    console.log(`\nStep 6: Title polish via ${POLISH_MODEL}...`);

    const chatFn = await buildChatFn(POLISH_MODEL);
    // Build lookup for ticket texts
    const ticketTextsMap = new Map<string, string>();
    for (const t of coreTickets) ticketTextsMap.set(t.id, t.text);

    const forPolish: PatternForPolish[] = patterns.map((p) => ({
      title: p.title,
      entities: p.entities,
      ticketCount: p.ticketIds.length,
      evidence: p.evidence,
      allTicketTexts: p.ticketIds.map((id) => ticketTextsMap.get(id) || "").filter(Boolean),
    }));

    // Use batch (JSON) for Claude, sequential (plaintext) for local models
    const useSequential = POLISH_MODEL !== "claude";
    const polished = useSequential
      ? await polishTitlesSequential(forPolish, chatFn)
      : await polishTitles(forPolish, chatFn);
    llmCalls = useSequential ? forPolish.length : 1;

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
  console.log(`LLM: ${llmCalls} calls (title polish: ${POLISH_MODEL})${polishFallbacks ? `, ${polishFallbacks} fallbacks` : ""}\n`);

  const coveredIds = new Set(patterns.flatMap((p) => p.ticketIds));
  const coverage = coveredIds.size / coreTickets.length;
  console.log(`Täckning: ${coveredIds.size}/${coreTickets.length} core (${Math.round(coverage * 100)}%)`);

  // Catch-all check
  const catchAll = patterns.filter((p) => p.ticketIds.length > 15);
  console.log(catchAll.length
    ? `⚠ ${catchAll.length} catch-all mönster (>15 tickets): ${catchAll.map((p) => `"${p.title}" (${p.ticketIds.length})`).join(", ")}`
    : `✓ Inga catch-all (alla ≤15 tickets)`
  );

  // Duplicates check
  let dupeCount = 0;
  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      if (patterns[i].title === patterns[j].title) {
        console.log(`  ⚠ Dubblett: "${patterns[i].title}"`);
        dupeCount++;
      }
    }
  }
  console.log(dupeCount ? "" : `✓ Inga dubbletter`);

  // Ticket reuse
  const usage: Record<string, number> = {};
  for (const p of patterns) for (const id of p.ticketIds) usage[id] = (usage[id] || 0) + 1;
  const reused = Object.values(usage).filter((c) => c > 1).length;
  console.log(reused ? `⚠ ${reused} ärenden i flera mönster` : `✓ Varje ärende i max ett mönster`);

  // Distributions
  const sizes = patterns.map((p) => p.ticketIds.length).sort((a, b) => b - a);
  console.log(`\nStorlekar: min=${sizes[sizes.length - 1]} max=${sizes[0]} median=${sizes[Math.floor(sizes.length / 2)]} avg=${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}`);

  const scopeC: Record<string, number> = {};
  const trendC: Record<string, number> = {};
  const confC: Record<string, number> = {};
  for (const p of patterns) {
    scopeC[p.scope] = (scopeC[p.scope] || 0) + 1;
    trendC[p.trend] = (trendC[p.trend] || 0) + 1;
    confC[p.confidence] = (confC[p.confidence] || 0) + 1;
  }
  console.log(`Scope: ${Object.entries(scopeC).map(([t, c]) => `${t}=${c}`).join(", ")}`);
  console.log(`Trend: ${Object.entries(trendC).map(([t, c]) => `${t}=${c}`).join(", ")}`);
  console.log(`Confidence: ${Object.entries(confC).map(([c, n]) => `${c}=${n}`).join(", ")}`);

  const withEnt = patterns.filter((p) => p.entities.length > 0).length;
  const totEnt = patterns.reduce((s, p) => s + p.entities.length, 0);
  console.log(`Entities: ${withEnt}/${patterns.length} patterns (${totEnt} total)`);

  // All patterns
  console.log("\n" + "═".repeat(62));
  console.log("ALLA MÖNSTER");
  console.log("═".repeat(62));
  for (const p of patterns) {
    console.log(`\n[${p.scope}/${p.trend}] [${p.confidence}] ${p.title} (${p.ticketIds.length} ärenden)`);
    console.log(`  ${p.description}`);
    if (p.entities.length) console.log(`  Entities: ${p.entities.join(", ")}`);
    console.log(`  Evidens: ${p.evidence.map((e) => `"${e.text}" (${e.person})`).join(" | ")}`);
  }

  // Summary JSON
  const score = {
    pipeline: "v3-deterministic",
    totalTickets: tickets.length,
    noiseFiltered: tickets.length - coreTickets.length,
    coreTickets: coreTickets.length,
    patterns: patterns.length,
    coverage: `${coveredIds.size}/${coreTickets.length} (${Math.round(coverage * 100)}%)`,
    catchAll: catchAll.length,
    maxGroupSize: maxSize,
    duplicates: dupeCount,
    ticketReuse: reused,
    totalDurationMs: elapsed,
    polishModel: POLISH_MODEL,
    llmCalls,
    polishFallbacks,
    clusters: clusters.length,
    groups: meaningfulGroups.length,
    scope: scopeC,
    trend: trendC,
    confidence: confC,
    entitiesTotal: totEnt,
    entitiesCoverage: `${withEnt}/${patterns.length}`,
  };

  console.log("\n" + "═".repeat(62));
  console.log("SAMMANFATTNING");
  console.log("═".repeat(62));
  console.log(JSON.stringify(score, null, 2));

  const outFile = POLISH_MODEL !== "none" ? `eval-real-data-v3-${POLISH_MODEL}.json` : "eval-real-data-v3.json";
  writeFileSync(
    `${process.cwd()}/${outFile}`,
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
        entities: p.entities,
        evidence: p.evidence,
        ticketCount: p.ticketIds.length,
        ticketIds: p.ticketIds,
      })),
    }, null, 2)
  );
  console.log(`\nSparad: ${outFile}`);
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function buildChatFn(model: string): Promise<(msgs: ChatMessage[], maxTokens: number) => Promise<string>> {
  if (model === "claude") {
    // Use Anthropic SDK
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

  if (model === "gpt-oss") {
    const { ollamaChat } = await import("../lib/ai/ollama-client");
    return (msgs, maxTokens) => ollamaChat(msgs, maxTokens, "gpt-oss:20b");
  }

  if (model === "ministral") {
    const { localChat } = await import("../lib/ai/local-client");
    process.env.LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || "http://127.0.0.1:8081";
    return (msgs, maxTokens) => localChat(msgs, maxTokens);
  }

  throw new Error(`Unknown polish model: ${model}. Use: claude, gpt-oss, ministral`);
}

main().catch(console.error);
