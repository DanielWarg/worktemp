import { getAnthropicClient } from "./client";
import { prisma } from "@/lib/db/prisma";
import { contextPrefix } from "./context";
import { chunk } from "./chunk";

const BATCH_SIZE = 8;

// Generate actionable suggestions for existing patterns
export async function generateSuggestions(workspaceId: string, systemContext = "") {
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
  });

  if (patterns.length === 0) return { generated: 0 };

  const client = getAnthropicClient();
  const batches = chunk(patterns, BATCH_SIZE);
  let totalGenerated = 0;
  let failedBatches = 0;

  for (const batch of batches) {
    const patternTexts = batch
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
          content: `${contextPrefix(systemContext)}Du är en teamcoach. Ge konkreta, handlingsbara förslag för varje identifierat mönster.
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
    } catch (err) {
      console.error(`[suggest] Batch ${batches.indexOf(batch) + 1}/${batches.length} misslyckades:`, err);
      failedBatches++;
      continue;
    }

    for (const r of results) {
      const pattern = batch[r.patternIndex];
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
        totalGenerated++;
      }
    }
  }

  return { generated: totalGenerated, batches: batches.length, failedBatches };
}
