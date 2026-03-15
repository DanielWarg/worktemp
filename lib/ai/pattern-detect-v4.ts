/**
 * Pattern Detection v4 — Multilingual, Domain-Agnostic, Dedup-Aware.
 *
 * Pipeline:
 *   Step 1: Filter (pre-classify + deduplicate)
 *   Step 2: Embed (multilingual model, no person in text)
 *   Step 3: Cluster (parameterized thresholds, max size 20)
 *   Step 4: Topic extract (n-gram TF-IDF, domain-agnostic)
 *   Step 5: Pattern dedup (centroid similarity + topic overlap)
 *   Step 6: Metadata (org-based scope, deterministic titles from topics)
 *   Step 7: Title polish + suggestions (optional, via Ollama)
 *
 * Key differences from v3:
 * - Multilingual embedding model (handles Swedish natively)
 * - No person name in embedding text (prevents reporter-based clustering)
 * - Topic extraction instead of entity extraction (domain-agnostic)
 * - Pattern dedup with dual signal (centroid + topics)
 * - Org-based scope calculation
 * - No sub-split step (tighter clustering makes it unnecessary)
 */

import { prisma } from "@/lib/db/prisma";
import { classifyTicket, findDuplicates, type TicketClass } from "./pre-classify";
import { clusterChallenges, type ClusterOptions } from "./cluster-challenges";
import { extractCorpusTopics, aggregateClusterTopics } from "./topic-extract";
import { deduplicatePatterns } from "./pattern-dedup";
import { calcTrend, calcScopeByOrg, calcConfidence, type TrendType, type ScopeType, type ConfidenceLevel } from "./trend-calc";
import { polishWithSuggestions, type PatternForPolish } from "./title-polish";

type PatternResult = {
  title: string;
  description: string;
  patternType: "RECURRING" | "ESCALATING" | "CROSS_PERSON" | "CROSS_TEAM";
  ticketIds: string[];
  topics: string[];
  scope: ScopeType;
  trend: TrendType;
  confidence: ConfidenceLevel;
  evidence: { text: string; person: string }[];
  suggestion: string;
};

export type V4Options = {
  clusterOptions?: ClusterOptions;
};

export async function detectPatternsV4(workspaceId: string, options?: V4Options) {
  const t0 = Date.now();

  const challenges = await prisma.challenge.findMany({
    where: { workspaceId },
    include: {
      person: { select: { id: true, name: true } },
      session: { select: { id: true, startedAt: true } },
      tags: { include: { tag: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (challenges.length < 3) return { detected: 0, pipeline: "v4" };

  // ─── Step 1: Filter — pre-classify + deduplicate ───
  const classifications = new Map<string, { ticketClass: TicketClass; isNoise: boolean }>();
  for (const c of challenges) {
    const text = c.contentNormalized || c.contentRaw;
    const tags = c.tags.map((t) => t.tag.name);
    classifications.set(c.id, classifyTicket(text, tags));
  }

  const duplicateIds = findDuplicates(
    challenges.map((c) => ({
      id: c.id,
      text: c.contentNormalized || c.contentRaw,
      person: c.person.name,
    }))
  );
  for (const id of duplicateIds) {
    classifications.set(id, { ticketClass: "duplicate_candidate", isNoise: true });
  }

  const coreTickets = challenges.filter((c) => !classifications.get(c.id)?.isNoise);
  console.log(`[v4] Step 1: ${challenges.length} total → ${coreTickets.length} core (${challenges.length - coreTickets.length} noise filtered)`);

  if (coreTickets.length < 3) return { detected: 0, pipeline: "v4" };

  // ─── Step 2: Embed (multilingual, no person in text) ───
  let embeddings: Map<string, number[]>;
  let clusters: typeof coreTickets[];

  try {
    const { embedChallenges } = await import("./embed-challenges");
    const forEmbed = coreTickets.map((c) => ({
      id: c.id,
      text: c.contentNormalized || c.contentRaw,
      tags: c.tags.map((t) => t.tag.name),
      // person intentionally omitted
    }));
    embeddings = await embedChallenges(forEmbed);

    // ─── Step 3: Cluster (parameterized thresholds) ───
    clusters = clusterChallenges(coreTickets, embeddings, options?.clusterOptions);
    console.log(`[v4] Step 2-3: ${clusters.length} clusters [${clusters.map((c) => c.length).join(",")}]`);
  } catch (err) {
    console.error("[v4] Embedding failed:", err);
    return { detected: 0, pipeline: "v4", error: "embedding_failed" };
  }

  // ─── Step 4: Topic extraction (n-gram TF-IDF) ───
  const corpusInput = coreTickets.map((c) => ({
    id: c.id,
    text: c.contentNormalized || c.contentRaw,
    tags: c.tags.map((t) => t.tag.name),
  }));
  const ticketTopics = extractCorpusTopics(corpusInput);
  const withTopics = [...ticketTopics.values()].filter((t) => t.topics.length > 0).length;
  console.log(`[v4] Step 4: Topics for ${ticketTopics.size} tickets (${withTopics} with topics)`);

  // Filter clusters to meaningful groups (>= 2 tickets)
  const meaningfulGroups = clusters.filter((g) => g.length >= 2);
  console.log(`[v4] ${clusters.length} clusters → ${meaningfulGroups.length} meaningful groups`);

  // Build cluster-level topics
  const clusterTopicsMap = new Map<number, string[]>();
  for (let i = 0; i < meaningfulGroups.length; i++) {
    const ids = meaningfulGroups[i].map((c) => c.id);
    clusterTopicsMap.set(i, aggregateClusterTopics(ticketTopics, ids));
  }

  // ─── Step 5: Pattern dedup (dual signal) ───
  // Build temporary pattern objects for dedup
  type PrePattern = {
    ticketIds: string[];
    topics: string[];
    groupIdx: number;
  };
  let prePatterns: PrePattern[] = meaningfulGroups.map((group, i) => ({
    ticketIds: group.map((c) => c.id),
    topics: clusterTopicsMap.get(i) || [],
    groupIdx: i,
  }));

  const beforeDedup = prePatterns.length;
  prePatterns = deduplicatePatterns(prePatterns, embeddings);
  const mergeCount = beforeDedup - prePatterns.length;
  console.log(`[v4] Step 5: ${beforeDedup} → ${prePatterns.length} patterns after dedup (${mergeCount} merged)`);

  // ─── Step 6: Metadata (deterministic) ───
  const ticketPersons = new Map<string, string>();
  const ticketOrgs = new Map<string, string>();
  const ticketDates = new Map<string, Date>();
  const ticketTexts = new Map<string, string>();
  for (const c of coreTickets) {
    ticketPersons.set(c.id, c.person.name);
    ticketOrgs.set(c.id, c.customerName || "");
    ticketDates.set(c.id, c.session?.startedAt ?? c.createdAt);
    ticketTexts.set(c.id, c.contentNormalized || c.contentRaw);
  }

  const patterns: PatternResult[] = [];
  for (const pp of prePatterns) {
    const topics = pp.topics.length > 0
      ? pp.topics
      : aggregateClusterTopics(ticketTopics, pp.ticketIds);

    // Deterministic title from topics
    const title = buildTitleFromTopics(topics, pp.ticketIds, ticketTexts);

    // Scope: org-based if available, fallback to person count
    const uniqueOrgs = new Set(
      pp.ticketIds.map((id) => ticketOrgs.get(id)).filter((o): o is string => !!o && o.length > 0)
    );
    const uniquePersons = new Set(
      pp.ticketIds.map((id) => ticketPersons.get(id)).filter(Boolean)
    );
    const scope = calcScopeByOrg(uniqueOrgs.size, uniquePersons.size);

    // Trend from dates
    const dates = pp.ticketIds
      .map((id) => ticketDates.get(id))
      .filter((d): d is Date => d != null);
    const trend = calcTrend(dates);

    // Confidence: ticket count + topic specificity
    const hasSpecificTopic = topics.length > 0;
    const confidence = calcConfidence(pp.ticketIds.length, hasSpecificTopic);

    // Evidence: top 3 ticket texts
    const evidence = pp.ticketIds
      .slice(0, 3)
      .map((id) => ({
        text: ticketTexts.get(id) || "",
        person: ticketPersons.get(id) || "Okänd",
      }));

    // Description
    const topicList = topics.slice(0, 5).join(", ");
    const description = [
      `${pp.ticketIds.length} ärenden`,
      topicList ? `Ämnen: ${topicList}` : null,
      `Scope: ${scope}`,
      `Trend: ${trend}`,
      `Rapportörer: ${[...uniquePersons].slice(0, 5).join(", ")}`,
    ].filter(Boolean).join(". ") + ".";

    const patternType = mapToPatternType(scope, trend);

    patterns.push({
      title,
      description,
      patternType,
      ticketIds: pp.ticketIds,
      topics: topics.slice(0, 5),
      scope,
      trend,
      confidence,
      evidence,
      suggestion: "",
    });
  }

  // Deduplicate titles — append differentiator for collisions
  const titleCount = new Map<string, number>();
  for (const p of patterns) titleCount.set(p.title, (titleCount.get(p.title) || 0) + 1);
  const titleSeen = new Map<string, number>();
  for (const p of patterns) {
    if ((titleCount.get(p.title) || 0) > 1) {
      const idx = (titleSeen.get(p.title) || 0) + 1;
      titleSeen.set(p.title, idx);
      const topPerson = p.evidence[0]?.person;
      if (topPerson && idx <= 2) {
        p.title = `${p.title} (${topPerson})`;
      } else {
        p.title = `${p.title} #${idx}`;
      }
    }
  }

  console.log(`[v4] Step 6: ${patterns.length} patterns with metadata`);

  // ─── Step 7: Title polish + suggestions (optional, via Ollama) ───
  let llmCalls = 0;
  try {
    const ollamaCheck = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(2000),
    });
    if (ollamaCheck.ok) {
      const { ollamaChat } = await import("./ollama-client");
      const chatFn = (msgs: { role: "system" | "user" | "assistant"; content: string }[], maxTokens: number) =>
        ollamaChat(msgs, maxTokens, "qwen2.5:7b");

      const forPolish: PatternForPolish[] = patterns.map((p) => ({
        title: p.title,
        entities: p.topics,
        ticketCount: p.ticketIds.length,
        evidence: p.evidence,
        allTicketTexts: p.ticketIds.map((id) => ticketTexts.get(id) || "").filter(Boolean),
      }));

      const polished = await polishWithSuggestions(forPolish, chatFn);
      llmCalls = polished.length;
      let polishCount = 0;

      for (let i = 0; i < patterns.length; i++) {
        if (!polished[i].fallbackUsed) {
          patterns[i].title = polished[i].polished;
          polishCount++;
        }
        if (polished[i].suggestion) {
          patterns[i].suggestion = polished[i].suggestion;
        }
      }
      console.log(`[v4] Step 7: ${polishCount}/${patterns.length} titles polished, ${llmCalls} LLM calls`);
    } else {
      console.log("[v4] Step 7: Ollama not available, using deterministic titles");
    }
  } catch {
    console.log("[v4] Step 7: Ollama not available, using deterministic titles");
  }

  // Log distributions
  const scopeDist = countBy(patterns, (p) => p.scope);
  const trendDist = countBy(patterns, (p) => p.trend);
  const confDist = countBy(patterns, (p) => p.confidence);
  console.log(`[v4] Scope: ${fmtDist(scopeDist)} | Trend: ${fmtDist(trendDist)} | Confidence: ${fmtDist(confDist)}`);

  // ─── Persist to DB ───
  const existingPatterns = await prisma.pattern.findMany({
    where: { workspaceId },
    select: { title: true },
  });
  const existingTitles = new Set(existingPatterns.map((p) => p.title.toLowerCase()));

  let created = 0;
  for (const p of patterns) {
    if (existingTitles.has(p.title.toLowerCase())) continue;
    if (p.ticketIds.length < 2) continue;

    const pattern = await prisma.pattern.create({
      data: {
        workspaceId,
        title: p.title,
        description: p.description,
        patternType: p.patternType,
        source: "AI_DETECTED",
        status: "EMERGING",
        occurrenceCount: p.ticketIds.length,
        patternChallenges: {
          create: p.ticketIds.map((challengeId) => ({ challengeId })),
        },
      },
    });

    if (p.suggestion) {
      await prisma.suggestion.create({
        data: {
          patternId: pattern.id,
          content: p.suggestion,
          source: "AI_GENERATED",
          status: "PENDING",
        },
      });
    }

    created++;
  }

  const coveredIds = new Set(patterns.flatMap((p) => p.ticketIds));
  const coverage = coreTickets.length > 0 ? coveredIds.size / coreTickets.length : 0;
  const elapsed = Date.now() - t0;

  console.log(`[v4] Done: ${created} patterns, coverage ${(coverage * 100).toFixed(1)}%, ${elapsed}ms`);

  return {
    detected: created,
    pipeline: "v4",
    clusters: clusters.length,
    patterns: patterns.length,
    coverage: Math.round(coverage * 100),
    llmCalls,
    coreTickets: coreTickets.length,
    noiseFiltered: challenges.length - coreTickets.length,
    dedupMerged: mergeCount,
    elapsed,
    scopeDistribution: scopeDist,
    trendDistribution: trendDist,
    confidenceDistribution: confDist,
    maxGroupSize: Math.max(...(patterns.map((p) => p.ticketIds.length).length > 0 ? patterns.map((p) => p.ticketIds.length) : [0])),
    patternDetails: patterns.map((p) => ({
      title: p.title,
      tickets: p.ticketIds.length,
      scope: p.scope,
      trend: p.trend,
      confidence: p.confidence,
      topics: p.topics,
      evidence: p.evidence,
    })),
  };
}

// Swedish action/symptom words for title generation
const ACTION_WORDS = new Set([
  "saknas", "fel", "fungerar", "funkar", "problem", "trasig",
  "kraschar", "hänger", "timeout", "långsam", "nere", "avbrott",
  "inloggning", "behörighet", "import", "export", "uppgradering",
  "installation", "konfiguration", "migration", "byte",
  "missing", "error", "broken", "failed", "unavailable",
  "felanmälan", "störning", "driftstörning",
]);

/** Build deterministic title from aggregated topics */
function buildTitleFromTopics(
  topics: string[],
  ticketIds: string[],
  ticketTexts: Map<string, string>,
): string {
  const texts = ticketIds.map((id) => ticketTexts.get(id) || "").filter(Boolean);

  // Separate proper nouns (system names) from regular topics
  const properNouns = topics.filter((t) => isProperNounTopic(t));
  const otherTopics = topics.filter((t) => !isProperNounTopic(t));

  // Find action word from ticket texts
  const action = findActionWord(texts);

  // Priority 1: proper noun + action word — "TIMS — fungerar inte"
  if (properNouns.length > 0 && action) {
    return `${properNouns[0]} — ${action}`;
  }

  // Priority 2: proper noun + other topic — "TIMS — spårningshistorik"
  if (properNouns.length > 0 && otherTopics.length > 0) {
    return `${properNouns[0]} — ${otherTopics[0]}`;
  }

  // Priority 3: two proper nouns — "InGrid + OCS"
  if (properNouns.length >= 2) {
    return `${properNouns[0]} + ${properNouns[1]}`;
  }

  // Priority 4: proper noun + common keyword — "TIMS — ärendehantering"
  if (properNouns.length > 0) {
    const keyword = findCommonKeyword(texts, properNouns[0]);
    if (keyword) return `${properNouns[0]} — ${keyword}`;
    return properNouns[0];
  }

  // Priority 5: first topic + second topic — "spårningshistorik — saknas"
  if (topics.length >= 2) {
    return `${topics[0]} — ${topics[1]}`;
  }

  // Priority 6: single topic + action
  if (topics.length === 1) {
    if (action) return `${topics[0]} — ${action}`;
    const keyword = findCommonKeyword(texts, topics[0]);
    if (keyword) return `${topics[0]} — ${keyword}`;
    return topics[0];
  }

  // Fallback: common keywords from texts
  const keywords = findTopKeywords(texts);
  if (keywords.length > 0) return keywords.join(" ");
  return `Mönster (${ticketIds.length} ärenden)`;
}

function isProperNounTopic(topic: string): boolean {
  if (topic.includes(" ")) return false; // bigrams are not proper nouns
  if (/^[A-ZÄÖÅ][A-ZÄÖÅ0-9]{2,}$/.test(topic)) return true; // ALLCAPS
  if (/^[A-ZÄÖÅ][a-zäöå]+[A-ZÄÖÅ]/.test(topic)) return true; // CamelCase
  if (/^[A-ZÄÖÅ][a-zäöå]{2,}$/.test(topic)) return true; // Capitalized word ≥3 chars
  return false;
}

/** Find the most common action/symptom word from ticket texts */
function findActionWord(texts: string[]): string {
  const freq = new Map<string, number>();
  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const action of ACTION_WORDS) {
      if (lower.includes(action)) {
        freq.set(action, (freq.get(action) || 0) + 1);
      }
    }
  }
  // Need at least 30% of tickets to mention the action
  const threshold = Math.ceil(texts.length * 0.3);
  const best = [...freq.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1]);
  return best[0]?.[0] || "";
}

/** Find a common keyword that doesn't duplicate the primary topic */
function findCommonKeyword(texts: string[], exclude: string): string {
  const wordFreq = new Map<string, number>();
  const excludeLower = exclude.toLowerCase();
  for (const text of texts) {
    const words = new Set(text.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    for (const word of words) {
      if (word === excludeLower) continue;
      if (ACTION_WORDS.has(word)) continue; // actions handled separately
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }
  const common = [...wordFreq.entries()]
    .filter(([, count]) => count >= Math.ceil(texts.length * 0.4))
    .sort((a, b) => b[1] - a[1]);
  return common[0]?.[0] || "";
}

/** Find top keywords from texts for fallback titles */
function findTopKeywords(texts: string[]): string[] {
  if (texts.length === 0) return [];
  const wordFreq = new Map<string, number>();
  for (const text of texts) {
    const words = new Set(text.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    for (const word of words) wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }
  return [...wordFreq.entries()]
    .filter(([, count]) => count >= Math.ceil(texts.length * 0.5))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);
}

function mapToPatternType(
  scope: ScopeType,
  trend: TrendType,
): "RECURRING" | "ESCALATING" | "CROSS_PERSON" | "CROSS_TEAM" {
  if (trend === "ESCALATING") return "ESCALATING";
  if (scope === "CROSS_TEAM") return "CROSS_TEAM";
  if (scope === "CROSS_PERSON") return "CROSS_PERSON";
  return "RECURRING";
}

function countBy<T>(items: T[], fn: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = fn(item);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function fmtDist(dist: Record<string, number>): string {
  return Object.entries(dist).map(([k, v]) => `${k}:${v}`).join(" ");
}
