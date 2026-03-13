import { localChat } from "./local-client";
import { prisma } from "@/lib/db/prisma";
import { contextPrefix } from "./context";
import { chunk } from "./chunk";

const BATCH_SIZE = 40;

export async function normalizeChallengesLocal(workspaceId: string, systemContext = "") {
  const challenges = await prisma.challenge.findMany({
    where: { workspaceId, contentNormalized: null },
  });

  if (challenges.length === 0) return { processed: 0 };

  const batches = chunk(challenges, BATCH_SIZE);
  let totalUpdated = 0;
  let failedBatches = 0;

  for (const batch of batches) {
    const challengeTexts = batch.map((c, i) => `${i + 1}. "${c.contentRaw}"`).join("\n");

    const text = await localChat([
      {
        role: "user",
        content: `${contextPrefix(systemContext)}Du är en textanalytiker. Normalisera följande utmaningar som fångats i teammöten.
För varje utmaning, ge en kort, ren, standardiserad version som bevarar kärnbetydelsen.
Ta bort fyllnadsord, talspråk och upprepningar. Behåll den specifika innebörden.

Utmaningar:
${challengeTexts}

Svara i JSON-format som en array av strängar, en per utmaning, i samma ordning:
["normaliserad 1", "normaliserad 2", ...]`,
      },
    ]);

    let normalized: string[];
    try {
      const match = text.match(/\[[\s\S]*\]/);
      normalized = match ? JSON.parse(match[0]) : [];
    } catch (err) {
      console.error(`[local-normalize] Batch ${batches.indexOf(batch) + 1}/${batches.length} misslyckades:`, err);
      failedBatches++;
      continue;
    }

    for (let i = 0; i < Math.min(batch.length, normalized.length); i++) {
      if (normalized[i]) {
        await prisma.challenge.update({
          where: { id: batch[i].id },
          data: { contentNormalized: normalized[i] },
        });
        totalUpdated++;
      }
    }
  }

  return { processed: totalUpdated, batches: batches.length, failedBatches };
}
