import { getAnthropicClient } from "./client";
import { prisma } from "@/lib/db/prisma";

// Normalize raw challenge text: clean up, standardize, extract key meaning
export async function normalizeChallenges(workspaceId: string) {
  const challenges = await prisma.challenge.findMany({
    where: { workspaceId, contentNormalized: null },
    take: 50,
  });

  if (challenges.length === 0) return { processed: 0 };

  const client = getAnthropicClient();

  const challengeTexts = challenges.map((c, i) => `${i + 1}. "${c.contentRaw}"`).join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Du är en textanalytiker. Normalisera följande utmaningar som fångats i teammöten.
För varje utmaning, ge en kort, ren, standardiserad version som bevarar kärnbetydelsen.
Ta bort fyllnadsord, talspråk och upprepningar. Behåll den specifika innebörden.

Utmaningar:
${challengeTexts}

Svara i JSON-format som en array av strängar, en per utmaning, i samma ordning:
["normaliserad 1", "normaliserad 2", ...]`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  let normalized: string[];
  try {
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    normalized = match ? JSON.parse(match[0]) : [];
  } catch {
    return { processed: 0, error: "Failed to parse AI response" };
  }

  let updated = 0;
  for (let i = 0; i < Math.min(challenges.length, normalized.length); i++) {
    if (normalized[i]) {
      await prisma.challenge.update({
        where: { id: challenges[i].id },
        data: { contentNormalized: normalized[i] },
      });
      updated++;
    }
  }

  return { processed: updated };
}
