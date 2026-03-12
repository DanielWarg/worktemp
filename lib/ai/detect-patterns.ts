import { getAnthropicClient } from "./client";
import { prisma } from "@/lib/db/prisma";

// AI-powered pattern detection using semantic analysis
export async function detectPatternsAI(workspaceId: string) {
  const challenges = await prisma.challenge.findMany({
    where: { workspaceId },
    include: {
      person: { select: { id: true, name: true } },
      session: { select: { id: true, startedAt: true } },
      tags: { include: { tag: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (challenges.length < 3) return { detected: 0 };

  const client = getAnthropicClient();

  const challengeTexts = challenges
    .map(
      (c, i) =>
        `${i + 1}. [id:${c.id}] Person: ${c.person.name} | Taggar: ${
          c.tags.map((t) => t.tag.name).join(", ") || "inga"
        } | "${c.contentNormalized || c.contentRaw}"`
    )
    .join("\n");

  // Get existing patterns to avoid duplicates
  const existingPatterns = await prisma.pattern.findMany({
    where: { workspaceId },
    select: { title: true },
  });
  const existingTitles = existingPatterns.map((p) => p.title);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `Du analyserar utmaningar som fångats i teammöten. Identifiera mönster — problem som är återkommande, eskalerande, eller delas av flera personer.

Befintliga mönster (skapa inte dubbletter): ${existingTitles.join(", ") || "(inga)"}

Utmaningar:
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
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  let detected: {
    title: string;
    description: string;
    patternType: string;
    challengeIds: string[];
    suggestion: string;
  }[];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    detected = match ? JSON.parse(match[0]) : [];
  } catch {
    return { detected: 0, error: "Failed to parse AI response" };
  }

  const validChallengeIds = new Set(challenges.map((c) => c.id));
  let created = 0;

  for (const d of detected) {
    // Skip if title already exists
    if (existingTitles.some((t) => t.toLowerCase() === d.title.toLowerCase())) continue;

    const validIds = d.challengeIds.filter((id) => validChallengeIds.has(id));
    if (validIds.length < 2) continue;

    const pattern = await prisma.pattern.create({
      data: {
        workspaceId,
        title: d.title,
        description: d.description,
        patternType: d.patternType || "RECURRING",
        source: "AI_DETECTED",
        status: "EMERGING",
        occurrenceCount: validIds.length,
        patternChallenges: {
          create: validIds.map((challengeId) => ({ challengeId })),
        },
      },
    });

    // Create suggestion if provided
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

  return { detected: created };
}
