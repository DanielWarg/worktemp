import { localChat } from "./local-client";
import { prisma } from "@/lib/db/prisma";
import { contextPrefix } from "./context";
import { chunk } from "./chunk";

const BATCH_SIZE = 50;

type DetectedPattern = {
  title: string;
  description: string;
  patternType: string;
  challengeIds: string[];
  suggestion: string;
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

  const existingPatterns = await prisma.pattern.findMany({
    where: { workspaceId },
    select: { title: true },
  });
  const existingTitles = existingPatterns.map((p) => p.title);

  const batches = chunk(challenges, BATCH_SIZE);
  const allDetected: DetectedPattern[] = [];
  const validChallengeIds = new Set(challenges.map((c) => c.id));

  for (const batch of batches) {
    const challengeTexts = batch
      .map(
        (c, i) =>
          `${i + 1}. [id:${c.id}] Person: ${c.person.name} | Taggar: ${
            c.tags.map((t) => t.tag.name).join(", ") || "inga"
          } | "${c.contentNormalized || c.contentRaw}"`
      )
      .join("\n");

    const foundSoFar = allDetected.map((d) => d.title);
    const skipTitles = [...existingTitles, ...foundSoFar];

    const text = await localChat(
      [
        {
          role: "user",
          content: `${contextPrefix(systemContext)}Du analyserar utmaningar som fångats i teammöten. Identifiera mönster — problem som är återkommande, eskalerande, eller delas av flera personer.

Befintliga mönster (skapa inte dubbletter): ${skipTitles.join(", ") || "(inga)"}

Utmaningar (batch ${batches.indexOf(batch) + 1}/${batches.length}):
${challengeTexts}

Identifiera mönster och returnera JSON:
[{
  "title": "Kort titel",
  "description": "Förklaring av mönstret",
  "patternType": "RECURRING|ESCALATING|CROSS_PERSON|CROSS_TEAM",
  "challengeIds": ["id1", "id2", "id3"],
  "suggestion": "En konkret åtgärd teamet kan vidta"
}]

Returnera bara nya mönster. Kräv minst 2 challenges per mönster.
Om inga nya mönster finns, returnera tom array [].`,
        },
      ],
      3000
    );

    try {
      const match = text.match(/\[[\s\S]*\]/);
      const detected: DetectedPattern[] = match ? JSON.parse(match[0]) : [];
      for (const d of detected) {
        d.challengeIds = d.challengeIds.filter((id) => validChallengeIds.has(id));
        if (d.challengeIds.length >= 2) {
          allDetected.push(d);
        }
      }
    } catch {
      // skip unparseable batch
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

  return { detected: created, batches: batches.length };
}
