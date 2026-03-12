import { getAnthropicClient } from "./client";
import { prisma } from "@/lib/db/prisma";

// Generate actionable suggestions for existing patterns
export async function generateSuggestions(workspaceId: string) {
  const patterns = await prisma.pattern.findMany({
    where: {
      workspaceId,
      status: { in: ["EMERGING", "CONFIRMED"] },
      suggestions: { none: {} },
    },
    include: {
      patternChallenges: {
        include: {
          challenge: {
            include: { person: { select: { name: true } } },
          },
        },
      },
    },
    take: 10,
  });

  if (patterns.length === 0) return { generated: 0 };

  const client = getAnthropicClient();

  const patternTexts = patterns
    .map((p, i) => {
      const challenges = p.patternChallenges
        .map((pc) => `  - ${pc.challenge.person.name}: "${pc.challenge.contentNormalized || pc.challenge.contentRaw}"`)
        .join("\n");
      return `${i + 1}. Mönster: "${p.title}" (${p.patternType})\n   Beskrivning: ${p.description || "Ingen"}\n   Utmaningar:\n${challenges}`;
    })
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Du är en teamcoach. Ge konkreta, handlingsbara förslag för varje identifierat mönster.
Varje förslag ska vara specifikt och kunna genomföras inom en vecka.

Mönster:
${patternTexts}

Svara i JSON-format:
[{"patternIndex": 0, "suggestions": ["Förslag 1", "Förslag 2"]}, ...]`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  let results: { patternIndex: number; suggestions: string[] }[];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    results = match ? JSON.parse(match[0]) : [];
  } catch {
    return { generated: 0, error: "Failed to parse AI response" };
  }

  let generated = 0;
  for (const r of results) {
    const pattern = patterns[r.patternIndex];
    if (!pattern) continue;

    for (const content of r.suggestions) {
      await prisma.suggestion.create({
        data: {
          patternId: pattern.id,
          content,
          source: "AI_GENERATED",
          status: "PENDING",
        },
      });
      generated++;
    }
  }

  return { generated };
}
