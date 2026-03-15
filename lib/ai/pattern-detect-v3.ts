/**
 * Pattern Detection v3 — Embedding-First, LLM-Last.
 *
 * 95% deterministic pipeline:
 *   Step 1: Filter (pre-classify + deduplicate)
 *   Step 2: Embed + cluster
 *   Step 3: Entity extraction (regex, per ticket)
 *   Step 4: Sub-split large clusters (entity-driven)
 *   Step 5: Pattern metadata (deterministic: title, scope, trend, confidence, evidence)
 *
 * No LLM calls. ~5s total (embed + cluster + extract).
 * Optional Step 6 (title polish) not implemented — entity-titles are good enough.
 */

import { prisma } from "@/lib/db/prisma";
import { classifyTicket, findDuplicates, type TicketClass } from "./pre-classify";
import { clusterChallenges } from "./cluster-challenges";
import { extractEntities, extractEntitiesFromTags, mergeEntities, discoverCorpusEntities, type ExtractedEntities } from "./entity-extract";
import { subSplitCluster, type TicketWithEntities } from "./sub-split";
import { calcTrend, calcScope, calcConfidence, type TrendType, type ScopeType, type ConfidenceLevel } from "./trend-calc";

type PatternResult = {
  title: string;
  description: string;
  patternType: "RECURRING" | "ESCALATING" | "CROSS_PERSON" | "CROSS_TEAM";
  ticketIds: string[];
  scope: ScopeType;
  trend: TrendType;
  confidence: ConfidenceLevel;
  entities: string[];
  evidence: { text: string; person: string }[];
};

export async function detectPatternsV3(workspaceId: string) {
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

  if (challenges.length < 3) return { detected: 0, pipeline: "v3" };

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
  console.log(`[v3] Step 1: ${challenges.length} total → ${coreTickets.length} core (${challenges.length - coreTickets.length} noise filtered)`);

  if (coreTickets.length < 3) return { detected: 0, pipeline: "v3" };

  // ─── Step 2: Embed + cluster ───
  let embeddings: Map<string, number[]>;
  let clusters: typeof coreTickets[];

  try {
    const { embedChallenges } = await import("./embed-challenges");
    const forEmbed = coreTickets.map((c) => ({
      id: c.id,
      text: c.contentNormalized || c.contentRaw,
      tags: c.tags.map((t) => t.tag.name),
      person: c.person.name,
    }));
    embeddings = await embedChallenges(forEmbed);
    clusters = clusterChallenges(coreTickets, embeddings);
    console.log(`[v3] Step 2: ${clusters.length} clusters [${clusters.map((c) => c.length).join(",")}]`);
  } catch (err) {
    console.error("[v3] Embedding failed:", err);
    return { detected: 0, pipeline: "v3", error: "embedding_failed" };
  }

  // ─── Step 3: Entity extraction (per ticket + corpus-level) ───
  // First: discover entities from the full corpus (TF-IDF-like)
  const corpusInput = coreTickets.map((c) => ({
    id: c.id,
    text: c.contentNormalized || c.contentRaw,
    tags: c.tags.map((t) => t.tag.name),
  }));
  const corpusEntities = discoverCorpusEntities(corpusInput);

  // Then: per-ticket extraction, enriched with corpus-discovered entities
  const ticketEntities = new Map<string, ExtractedEntities>();
  for (const c of coreTickets) {
    const text = c.contentNormalized || c.contentRaw;
    const tags = c.tags.map((t) => t.tag.name);
    const textEntities = extractEntities(text);
    const tagEntities = extractEntitiesFromTags(tags);
    let merged = mergeEntities(textEntities, tagEntities);

    // Enrich with corpus-discovered entities that this ticket contains
    const discovered = corpusEntities.get(c.id) || [];
    if (discovered.length > 0) {
      const corpusResult: ExtractedEntities = {
        systems: discovered,
        actions: [],
        signature: discovered.sort().join("|"),
      };
      merged = mergeEntities(merged, corpusResult);
    }

    ticketEntities.set(c.id, merged);
  }
  const withEntities = [...ticketEntities.values()].filter((e) => e.systems.length > 0).length;
  console.log(`[v3] Step 3: Entities for ${ticketEntities.size} tickets (${withEntities} with system entities, ${corpusEntities.size > 0 ? "corpus-enriched" : "heuristic-only"})`);

  // ─── Step 4: Sub-split large clusters ───
  const allGroups: TicketWithEntities[][] = [];
  for (const cluster of clusters) {
    const ticketsWithEntities: TicketWithEntities[] = cluster.map((c) => ({
      id: c.id,
      text: c.contentNormalized || c.contentRaw,
      entities: ticketEntities.get(c.id) || { systems: [], actions: [], signature: "UNKNOWN" },
    }));
    const subGroups = subSplitCluster(ticketsWithEntities, embeddings);
    allGroups.push(...subGroups);
  }

  // Filter groups with < 2 tickets
  const meaningfulGroups = allGroups.filter((g) => g.length >= 2);
  console.log(`[v3] Step 4: ${clusters.length} clusters → ${meaningfulGroups.length} groups after sub-split (max size: ${Math.max(...meaningfulGroups.map((g) => g.length))})`);

  // ─── Step 5: Pattern metadata (deterministic) ───
  // Build lookup maps
  const ticketPersons = new Map<string, string>();
  const ticketDates = new Map<string, Date>();
  for (const c of coreTickets) {
    ticketPersons.set(c.id, c.person.name);
    ticketDates.set(c.id, c.session?.startedAt ?? c.createdAt);
  }

  const patterns: PatternResult[] = [];
  for (const group of meaningfulGroups) {
    // Aggregate entities across group
    const groupSystems = new Map<string, number>();
    const groupActions = new Map<string, number>();
    for (const t of group) {
      for (const sys of t.entities.systems) {
        groupSystems.set(sys, (groupSystems.get(sys) || 0) + 1);
      }
      for (const act of t.entities.actions) {
        groupActions.set(act, (groupActions.get(act) || 0) + 1);
      }
    }

    // Primary system + action for title
    const sortedSystems = [...groupSystems.entries()].sort((a, b) => b[1] - a[1]);
    const sortedActions = [...groupActions.entries()].sort((a, b) => b[1] - a[1]);
    const primarySystem = sortedSystems[0]?.[0];
    const primaryAction = sortedActions[0]?.[0];

    // Title: "SYSTEM — action" or fallback with differentiator
    const secondarySystem = sortedSystems[1]?.[0];
    const texts = group.map((t) => t.text);
    const keyword = findCommonWords(texts);
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

    // Scope: count unique persons/orgs
    const uniquePersons = new Set(group.map((t) => ticketPersons.get(t.id)).filter(Boolean));
    const scope = calcScope(uniquePersons.size);

    // Trend: from dates
    const dates = group
      .map((t) => ticketDates.get(t.id))
      .filter((d): d is Date => d != null);
    const trend = calcTrend(dates);

    // Confidence: ticket count + entity specificity
    const hasSpecificEntity = primarySystem != null;
    const confidence = calcConfidence(group.length, hasSpecificEntity);

    // Evidence: top 3 ticket titles + person
    const evidence = group
      .slice(0, 3)
      .map((t) => ({
        text: t.text,
        person: ticketPersons.get(t.id) || "Okänd",
      }));

    // Description: summarize the group
    const entityList = sortedSystems.map(([s, c]) => `${s} (${c})`).join(", ");
    const description = [
      `${group.length} ärenden`,
      entityList ? `System: ${entityList}` : null,
      `Scope: ${scope}`,
      `Trend: ${trend}`,
      `Rapportörer: ${[...uniquePersons].slice(0, 5).join(", ")}`,
    ].filter(Boolean).join(". ") + ".";

    // Map to Prisma patternType
    const patternType = mapToPatternType(scope, trend);

    patterns.push({
      title,
      description,
      patternType,
      ticketIds: group.map((t) => t.id),
      scope,
      trend,
      confidence,
      entities: sortedSystems.map(([s]) => s),
      evidence,
    });
  }

  // Deduplicate titles — append differentiator for collisions
  const titleCount = new Map<string, number>();
  for (const p of patterns) {
    titleCount.set(p.title, (titleCount.get(p.title) || 0) + 1);
  }
  const titleSeen = new Map<string, number>();
  for (const p of patterns) {
    if ((titleCount.get(p.title) || 0) > 1) {
      const idx = (titleSeen.get(p.title) || 0) + 1;
      titleSeen.set(p.title, idx);
      // Differentiate by top person or ticket count
      const topPerson = p.evidence[0]?.person;
      if (topPerson && idx <= 2) {
        p.title = `${p.title} (${topPerson})`;
      } else {
        p.title = `${p.title} #${idx}`;
      }
    }
  }

  console.log(`[v3] Step 5: ${patterns.length} patterns with metadata`);

  // Log distributions
  const scopeDist = countBy(patterns, (p) => p.scope);
  const trendDist = countBy(patterns, (p) => p.trend);
  const confDist = countBy(patterns, (p) => p.confidence);
  console.log(`[v3] Scope: ${fmtDist(scopeDist)} | Trend: ${fmtDist(trendDist)} | Confidence: ${fmtDist(confDist)}`);

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

    await prisma.pattern.create({
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
    created++;
  }

  const coveredIds = new Set(patterns.flatMap((p) => p.ticketIds));
  const coverage = coreTickets.length > 0 ? coveredIds.size / coreTickets.length : 0;
  const elapsed = Date.now() - t0;

  console.log(`[v3] Done: ${created} patterns, coverage ${(coverage * 100).toFixed(1)}%, ${elapsed}ms`);

  return {
    detected: created,
    pipeline: "v3",
    clusters: clusters.length,
    groups: meaningfulGroups.length,
    patterns: patterns.length,
    coverage: Math.round(coverage * 100),
    llmCalls: 0,
    coreTickets: coreTickets.length,
    noiseFiltered: challenges.length - coreTickets.length,
    elapsed,
    scopeDistribution: scopeDist,
    trendDistribution: trendDist,
    confidenceDistribution: confDist,
    maxGroupSize: Math.max(...meaningfulGroups.map((g) => g.length)),
    patternDetails: patterns.map((p) => ({
      title: p.title,
      tickets: p.ticketIds.length,
      scope: p.scope,
      trend: p.trend,
      confidence: p.confidence,
      entities: p.entities,
      evidence: p.evidence,
    })),
  };
}

/** Map scope + trend to Prisma PatternType enum */
function mapToPatternType(
  scope: ScopeType,
  trend: TrendType,
): "RECURRING" | "ESCALATING" | "CROSS_PERSON" | "CROSS_TEAM" {
  if (trend === "ESCALATING") return "ESCALATING";
  if (scope === "CROSS_TEAM") return "CROSS_TEAM";
  if (scope === "CROSS_PERSON") return "CROSS_PERSON";
  return "RECURRING";
}

/** Find common words across ticket texts (for fallback titles) */
function findCommonWords(texts: string[]): string {
  if (texts.length === 0) return "";
  const wordFreq = new Map<string, number>();
  for (const text of texts) {
    const words = new Set(text.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }
  const common = [...wordFreq.entries()]
    .filter(([, count]) => count >= Math.ceil(texts.length * 0.5))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);
  return common.join(" ");
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
