import { getAnthropicClient } from "./client";
import { prisma } from "@/lib/db/prisma";
import { contextPrefix } from "./context";
import { chunk } from "./chunk";

const BATCH_SIZE = 25;

// Auto-suggest tags for untagged challenges
export async function autoTagChallenges(workspaceId: string, systemContext = "") {
  const challenges = await prisma.challenge.findMany({
    where: { workspaceId, tags: { none: {} } },
  });

  if (challenges.length === 0) return { processed: 0 };

  const client = getAnthropicClient();
  const batches = chunk(challenges, BATCH_SIZE);
  let totalTagged = 0;
  let failedBatches = 0;

  for (const batch of batches) {
    // Re-fetch existing tags each batch so new tags from previous batches are reused
    const existingTags = await prisma.tag.findMany({ where: { workspaceId } });
    const existingTagNames = existingTags.map((t) => t.name).join(", ");

    const challengeTexts = batch
      .map((c, i) => `${i + 1}. [id:${c.id}] "${c.contentNormalized || c.contentRaw}"`)
      .join("\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `${contextPrefix(systemContext)}Du är en kategoriseringsexpert. Tilldela 1-3 taggar till varje utmaning.
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
    } catch (err) {
      console.error(`[auto-tag] Batch ${batches.indexOf(batch) + 1}/${batches.length} misslyckades:`, err);
      failedBatches++;
      continue;
    }

    for (const suggestion of suggestions) {
      const challenge = batch.find((c) => c.id === suggestion.id);
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
      totalTagged++;
    }
  }

  return { processed: totalTagged, batches: batches.length, failedBatches };
}
