/**
 * Micro-Step Pattern Detection Pipeline v2.
 *
 * 10-step pipeline where each LLM call does exactly one cognitive task.
 * Deterministic validation between every step. Fallback for every LLM step.
 *
 * v2.1 optimizations:
 *   - Small clusters (≤8) skip LLM for steps 2+3 (embedding-only)
 *   - JSON sanitizer fixes Ministral control-char issues
 *   - Larger batches in steps 6/7/8
 *   - Two-dimension classification (scope + behavior)
 *   - Structured evidence output
 *   - Stricter cross-cluster merge (label sim + signal overlap)
 */

import { prisma } from "@/lib/db/prisma";
import { classifyTicket, findDuplicates, type TicketClass } from "./pre-classify";
import { clusterChallenges } from "./cluster-challenges";
import { extractThemes } from "./micro-steps/extract-themes";
import { assignTickets } from "./micro-steps/assign-tickets";
import { validateThemes } from "./micro-steps/validate-themes";
import { mergeThemesAcrossClusters } from "./micro-steps/merge-themes";
import { namePatterns } from "./micro-steps/name-patterns";
import { classifyPatterns } from "./micro-steps/classify-patterns";
import { writeEvidence } from "./micro-steps/write-evidence";

type ChallengeForEmbed = {
  id: string;
  text: string;
  tags?: string[];
  person?: string;
};

const SMALL_CLUSTER = 8;

export async function detectPatternsV2(workspaceId: string, systemContext = "") {
  const challenges = await prisma.challenge.findMany({
    where: { workspaceId },
    include: {
      person: { select: { id: true, name: true } },
      session: { select: { id: true, startedAt: true } },
      tags: { include: { tag: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (challenges.length < 3) return { detected: 0, pipeline: "v2" };

  // ─── Step 0: Pre-classify + filter noise ───
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
  console.log(`[v2] Step 0: ${challenges.length} total → ${coreTickets.length} core (${challenges.length - coreTickets.length} noise filtered)`);

  if (coreTickets.length < 3) return { detected: 0, pipeline: "v2" };

  // ─── Step 1: Embed + cluster ───
  const forEmbed: ChallengeForEmbed[] = coreTickets.map((c) => ({
    id: c.id,
    text: c.contentNormalized || c.contentRaw,
    tags: c.tags.map((t) => t.tag.name),
    person: c.person.name,
  }));

  let embeddings: Map<string, number[]>;
  let clusters: typeof coreTickets[];

  try {
    const { embedChallenges } = await import("./embed-challenges");
    embeddings = await embedChallenges(forEmbed);
    clusters = clusterChallenges(coreTickets, embeddings);
    console.log(`[v2] Step 1: ${clusters.length} clusters [${clusters.map((c) => c.length).join(",")}]`);
  } catch (err) {
    console.error("[v2] Embedding failed:", err);
    return { detected: 0, pipeline: "v2", error: "embedding_failed" };
  }

  // Build lookup maps
  const ticketTexts = new Map<string, string>();
  const ticketPersons = new Map<string, string>();
  const ticketTags = new Map<string, string[]>();
  const ticketDetails = new Map<string, { text: string; person: string; tags: string[] }>();
  const validIds = new Set<string>();

  for (const c of coreTickets) {
    const text = c.contentNormalized || c.contentRaw;
    const tags = c.tags.map((t) => t.tag.name);
    ticketTexts.set(c.id, text);
    ticketPersons.set(c.id, c.person.name);
    ticketTags.set(c.id, tags);
    ticketDetails.set(c.id, { text, person: c.person.name, tags });
    validIds.add(c.id);
  }

  // ─── Steps 2-4: Per-cluster ───
  const clusterThemes: { clusterIndex: number; themes: ReturnType<typeof validateThemes> }[] = [];
  let llmCalls = 0;
  let fallbacks = 0;
  let skippedSmall = 0;

  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    const clusterTickets = cluster.map((c) => ({
      id: c.id,
      text: c.contentNormalized || c.contentRaw,
      tags: c.tags.map((t) => t.tag.name),
    }));

    const isSmall = cluster.length <= SMALL_CLUSTER;
    if (isSmall) skippedSmall++;

    // Step 2: Extract themes (small clusters use tag fallback, no LLM)
    const { themes, fallbackUsed: fb2 } = await extractThemes(
      clusterTickets.map((t) => ({ text: t.text, tags: t.tags })),
      systemContext
    );
    if (!isSmall) llmCalls++;
    if (fb2) fallbacks++;

    // Step 3: Assign tickets (small clusters use embedding, no LLM)
    const { assignments, unassigned, fallbackUsed: fb3 } = await assignTickets(
      themes,
      clusterTickets.map((t) => ({ id: t.id, text: t.text })),
      embeddings,
      systemContext
    );
    if (!isSmall) llmCalls++;
    if (fb3) fallbacks++;

    // Step 4: Validate
    const validated = validateThemes(assignments, unassigned, embeddings, validIds);

    if (validated.length > 0) {
      clusterThemes.push({ clusterIndex: ci, themes: validated });
    }

    const tag = isSmall ? " [embed-only]" : "";
    console.log(`[v2] Cluster ${ci + 1}/${clusters.length}: ${themes.length} themes → ${validated.length} validated (${cluster.length} tickets)${tag}`);
  }

  // ─── Step 5: Cross-cluster merge (stricter) ───
  const merged = await mergeThemesAcrossClusters(clusterThemes, ticketPersons, embeddings, ticketTags);
  console.log(`[v2] Step 5: ${clusterThemes.reduce((s, ct) => s + ct.themes.length, 0)} themes → ${merged.length} merged patterns`);

  if (merged.length === 0) return { detected: 0, pipeline: "v2", llmCalls, fallbacks };

  // ─── Step 6: Name + describe (batches of 8) ───
  const named = await namePatterns(merged, ticketTexts, systemContext);
  llmCalls += Math.ceil(merged.length / 8);
  console.log(`[v2] Step 6: Named ${named.length} patterns`);

  // ─── Step 7: Classify type (chunks of 12, two dimensions) ───
  const classified = await classifyPatterns(named, ticketPersons);
  llmCalls += Math.ceil(named.length / 12);
  console.log(`[v2] Step 7: Classified ${classified.length} patterns`);

  // ─── Step 8: Structured evidence (batches of 5) ───
  const evidenced = await writeEvidence(classified, ticketDetails, systemContext);
  llmCalls += Math.ceil(classified.length / 5);
  console.log(`[v2] Step 8: Evidence written for ${evidenced.length} patterns`);

  // ─── Step 9: Persist to DB ───
  const existingPatterns = await prisma.pattern.findMany({
    where: { workspaceId },
    select: { title: true },
  });
  const existingTitles = new Set(existingPatterns.map((p) => p.title.toLowerCase()));

  let created = 0;
  for (const p of evidenced) {
    if (existingTitles.has(p.title.toLowerCase())) continue;

    const verifiedIds = p.ticketIds.filter((id) => validIds.has(id));
    if (verifiedIds.length < 2) continue;

    const pattern = await prisma.pattern.create({
      data: {
        workspaceId,
        title: p.title,
        description: p.description,
        patternType: p.patternType || "RECURRING",
        source: "AI_DETECTED",
        status: "EMERGING",
        occurrenceCount: verifiedIds.length,
        patternChallenges: {
          create: verifiedIds.map((challengeId) => ({ challengeId })),
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

  const coveredIds = new Set(evidenced.flatMap((p) => p.ticketIds));
  const coverage = coreTickets.length > 0 ? coveredIds.size / coreTickets.length : 0;

  console.log(`[v2] Step 9: Created ${created} patterns, coverage ${(coverage * 100).toFixed(1)}%`);

  return {
    detected: created,
    pipeline: "v2",
    clusters: clusters.length,
    patterns: evidenced.length,
    coverage: Math.round(coverage * 100),
    llmCalls,
    fallbacks,
    skippedSmall,
    coreTickets: coreTickets.length,
    noiseFiltered: challenges.length - coreTickets.length,
  };
}
