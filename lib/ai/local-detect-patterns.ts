import { localChat } from "./local-client";
import { prisma } from "@/lib/db/prisma";
import { contextPrefix } from "./context";
import { chunk } from "./chunk";
import { embedChallenges, type ChallengeForEmbed } from "./embed-challenges";
import { clusterChallenges } from "./cluster-challenges";
import { classifyTicket, findDuplicates, buildBatchContext, type TicketClass } from "./pre-classify";

const BATCH_SIZE = 50;

type DetectedPattern = {
  title: string;
  description: string;
  patternType: string;
  challengeIds: string[];
  suggestion: string;
  evidence?: string;
  confidence?: "high" | "medium" | "low";
};

export async function detectPatternsAILocal(workspaceId: string, systemContext = "") {
  const challenges = await prisma.challenge.findMany({
    where: { workspaceId },
    include: {
      person: { select: { id: true, name: true } },
      session: { select: { id: true, startedAt: true } },
      tags: { include: { tag: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (challenges.length < 3) return { detected: 0 };

  // Pre-classify all challenges deterministically
  const classifications = new Map<string, { ticketClass: TicketClass; isNoise: boolean }>();
  for (const c of challenges) {
    const text = c.contentNormalized || c.contentRaw;
    const tags = c.tags.map((t) => t.tag.name);
    classifications.set(c.id, classifyTicket(text, tags));
  }

  // Find duplicate candidates
  const duplicateIds = findDuplicates(
    challenges.map((c) => ({
      id: c.id,
      text: c.contentNormalized || c.contentRaw,
      person: c.person.name,
    }))
  );
  for (const id of duplicateIds) {
    const cls = classifications.get(id);
    if (cls) classifications.set(id, { ticketClass: "duplicate_candidate", isNoise: true });
  }

  // Log pre-classification stats
  const classStats = new Map<string, number>();
  let noiseTotal = 0;
  for (const [, cls] of classifications) {
    classStats.set(cls.ticketClass, (classStats.get(cls.ticketClass) || 0) + 1);
    if (cls.isNoise) noiseTotal++;
  }
  console.log(`[pre-classify] ${challenges.length} ärenden: ${[...classStats.entries()].map(([k, v]) => `${k}=${v}`).join(", ")} (${noiseTotal} brus)`);

  const existingPatterns = await prisma.pattern.findMany({
    where: { workspaceId },
    select: { title: true },
  });
  const existingTitles = existingPatterns.map((p) => p.title);

  // Pre-cluster: embed and cluster semantically, fall back to chronological chunks
  let batches: typeof challenges[];
  let clusterMethod = "chronological";
  try {
    const forEmbed: ChallengeForEmbed[] = challenges.map((c) => ({
      id: c.id,
      text: c.contentNormalized || c.contentRaw,
      tags: c.tags.map((t) => t.tag.name),
      person: c.person.name,
    }));
    const embeddings = await embedChallenges(forEmbed);
    batches = clusterChallenges(challenges, embeddings);
    clusterMethod = "semantic";
    console.log(`[local-detect-patterns] ${batches.length} semantiska kluster (${challenges.length} ärenden)`);
  } catch (err) {
    console.warn("[local-detect-patterns] Embedding misslyckades, faller tillbaka till kronologiska batchar:", err);
    batches = chunk(challenges, BATCH_SIZE);
  }

  const allDetected: DetectedPattern[] = [];
  const validChallengeIds = new Set(challenges.map((c) => c.id));
  let failedBatches = 0;

  for (const batch of batches) {
    // Build batch context with aggregates
    const batchItems = batch.map((c) => ({
      id: c.id,
      person: c.person.name,
      tags: c.tags.map((t) => t.tag.name),
      text: c.contentNormalized || c.contentRaw,
    }));
    const batchContext = buildBatchContext(batchItems, classifications);

    const challengeTexts = batch
      .map((c, i) => {
        const cls = classifications.get(c.id);
        const classTag = cls ? ` [${cls.ticketClass}]` : "";
        return `${i + 1}. [id:${c.id}]${classTag} Person: ${c.person.name} | Taggar: ${
          c.tags.map((t) => t.tag.name).join(", ") || "inga"
        } | "${c.contentNormalized || c.contentRaw}"`;
      })
      .join("\n");

    const foundSoFar = allDetected.map((d) => d.title);
    const skipTitles = [...existingTitles, ...foundSoFar];

    const text = await localChat(
      [
        {
          role: "user",
          content: `${contextPrefix(systemContext)}Du analyserar utmaningar som fångats i teammöten. Identifiera mönster — problem som är återkommande, eskalerande, eller delas av flera personer/team.

${batchContext}

REGLER:
- Kräv minst 2 challenges per mönster
- Varje challenge ska bara tillhöra ETT mönster (det mest relevanta)
- Skapa INTE dubbletter av befintliga mönster
- Var restriktiv — skapa bara mönster med tydlig tematisk koppling
- Ärenden markerade [monitoring_alert] eller [duplicate_candidate] utgör sällan egna mönster — inkludera dem bara om de stärker ett reellt mönster
- Om inga mönster finns, returnera tom array []
- Ange confidence: "high" om tydlig evidens, "medium" om rimligt, "low" om svagt underlag

Befintliga mönster (skapa inte dubbletter): ${skipTitles.join(", ") || "(inga)"}

Utmaningar:
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
}]`,
        },
      ],
      4000
    );

    try {
      const match = text.match(/\[[\s\S]*\]/);
      const cleaned = match ? match[0].replace(/\/\/[^\n]*/g, "") : null;
      const detected: DetectedPattern[] = cleaned ? JSON.parse(cleaned) : [];
      for (const d of detected) {
        d.challengeIds = d.challengeIds.filter((id) => validChallengeIds.has(id));
        if (d.challengeIds.length >= 2) {
          allDetected.push(d);
        }
      }
    } catch (err) {
      console.error(`[local-detect-patterns] Batch ${batches.indexOf(batch) + 1}/${batches.length} misslyckades:`, err);
      failedBatches++;
    }
  }

  // Persist all detected patterns
  let created = 0;
  for (const d of allDetected) {
    if (existingTitles.some((t) => t.toLowerCase() === d.title.toLowerCase())) continue;

    const pattern = await prisma.pattern.create({
      data: {
        workspaceId,
        title: d.title,
        description: d.description,
        patternType: d.patternType || "RECURRING",
        source: "AI_DETECTED",
        status: "EMERGING",
        occurrenceCount: d.challengeIds.length,
        patternChallenges: {
          create: d.challengeIds.map((challengeId) => ({ challengeId })),
        },
      },
    });

    if (d.suggestion) {
      await prisma.suggestion.create({
        data: {
          patternId: pattern.id,
          content: d.suggestion,
          source: "AI_GENERATED",
          status: "PENDING",
        },
      });
    }

    created++;
  }

  return { detected: created, batches: batches.length, failedBatches, clusterMethod };
}
