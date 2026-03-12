import { getAnthropicClient } from "./client";
import { prisma } from "@/lib/db/prisma";

// Auto-suggest tags for untagged challenges
export async function autoTagChallenges(workspaceId: string) {
  // Get untagged challenges
  const challenges = await prisma.challenge.findMany({
    where: {
      workspaceId,
      tags: { none: {} },
    },
    take: 30,
  });

  if (challenges.length === 0) return { processed: 0 };

  // Get existing tags
  const existingTags = await prisma.tag.findMany({
    where: { workspaceId },
  });

  const client = getAnthropicClient();

  const challengeTexts = challenges
    .map((c, i) => `${i + 1}. [id:${c.id}] "${c.contentNormalized || c.contentRaw}"`)
    .join("\n");

  const existingTagNames = existingTags.map((t) => t.name).join(", ");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Du är en kategoriseringsexpert. Tilldela 1-3 taggar till varje utmaning.
Återanvänd befintliga taggar när det passar. Skapa nya taggar bara vid behov.
Taggar ska vara korta (1-3 ord) och beskrivande.

Befintliga taggar: ${existingTagNames || "(inga ännu)"}

Utmaningar:
${challengeTexts}

Svara i JSON-format:
[{"id": "challenge-id", "tags": ["tagg1", "tagg2"]}, ...]`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  let suggestions: { id: string; tags: string[] }[];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    suggestions = match ? JSON.parse(match[0]) : [];
  } catch {
    return { processed: 0, error: "Failed to parse AI response" };
  }

  let tagged = 0;
  for (const suggestion of suggestions) {
    const challenge = challenges.find((c) => c.id === suggestion.id);
    if (!challenge) continue;

    for (const tagName of suggestion.tags) {
      const tag = await prisma.tag.upsert({
        where: { workspaceId_name: { workspaceId, name: tagName.trim() } },
        create: { workspaceId, name: tagName.trim(), source: "AI_SUGGESTED" },
        update: {},
      });

      await prisma.challengeTag.upsert({
        where: { challengeId_tagId: { challengeId: challenge.id, tagId: tag.id } },
        create: { challengeId: challenge.id, tagId: tag.id },
        update: {},
      });
    }
    tagged++;
  }

  return { processed: tagged };
}
