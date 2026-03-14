import { localChat } from "./local-client";
import { prisma } from "@/lib/db/prisma";

// Refine step: self-critique + code-based deduplication of detected patterns
// Runs after pattern detection — works on persisted EMERGING patterns

export async function refinePatternsLocal(workspaceId: string) {
  const patterns = await prisma.pattern.findMany({
    where: { workspaceId, status: "EMERGING", source: "AI_DETECTED" },
    include: {
      patternChallenges: { select: { challengeId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (patterns.length < 2) return { refined: 0, merged: 0, discarded: 0 };

  let merged = 0;
  let discarded = 0;

  // --- Step 1: AI self-critique ---
  const patternsForReview = patterns
    .map(
      (p, i) =>
        `${i + 1}. "${p.title}" (${p.patternType}, ${p.patternChallenges.length} ärenden)\n   Beskrivning: ${p.description}`
    )
    .join("\n");

  try {
    const critiqueText = await localChat(
      [
        {
          role: "user",
          content: `Du är en kvalitetsgranskare. Granska dessa AI-detekterade mönster och identifiera problem.

Mönster att granska:
${patternsForReview}

Kontrollera:
1. DUBBLETTER: Finns mönster som beskriver samma underliggande problem med olika titlar?
2. STUFFING: Innehåller något mönster ärenden som inte hör dit?
3. KVALITET: Är beskrivningen tillräckligt specifik?

Returnera JSON-array (inga kommentarer):
[{
  "index": 0,
  "decision": "KEEP",
  "reason": "Tydligt och unikt mönster"
},
{
  "index": 1,
  "decision": "MERGE_INTO",
  "mergeIntoIndex": 0,
  "reason": "Beskriver samma problem som mönster 1"
},
{
  "index": 2,
  "decision": "DISCARD",
  "reason": "För vag beskrivning, inga tydliga kopplingar"
}]

Beslut per mönster: KEEP (behåll), MERGE_INTO (slå ihop med annat), DISCARD (ta bort).
Var konservativ — behåll hellre för många än för få. Slå bara ihop vid tydlig överlapp.`,
        },
      ],
      2000
    );

    const critiqueMatch = critiqueText.match(/\[[\s\S]*\]/);
    const critiqueCleaned = critiqueMatch
      ? critiqueMatch[0].replace(/\/\/[^\n]*/g, "")
      : null;

    if (critiqueCleaned) {
      const critiques: {
        index: number;
        decision: string;
        mergeIntoIndex?: number;
        reason?: string;
      }[] = JSON.parse(critiqueCleaned);

      // Process merges: move challenges from source → target pattern
      for (const c of critiques) {
        if (
          c.decision === "MERGE_INTO" &&
          c.mergeIntoIndex != null &&
          c.mergeIntoIndex >= 0 &&
          c.mergeIntoIndex < patterns.length &&
          c.index >= 0 &&
          c.index < patterns.length &&
          c.index !== c.mergeIntoIndex
        ) {
          const target = patterns[c.mergeIntoIndex];
          const source = patterns[c.index];
          const existingIds = new Set(
            target.patternChallenges.map((pc) => pc.challengeId)
          );

          // Move challenges that aren't already in target
          const toMove = source.patternChallenges.filter(
            (pc) => !existingIds.has(pc.challengeId)
          );
          if (toMove.length > 0) {
            await prisma.patternChallenge.createMany({
              data: toMove.map((pc) => ({
                patternId: target.id,
                challengeId: pc.challengeId,
              })),
              skipDuplicates: true,
            });
          }

          // Update target occurrence count
          await prisma.pattern.update({
            where: { id: target.id },
            data: {
              occurrenceCount:
                target.patternChallenges.length + toMove.length,
            },
          });

          // Delete source pattern (cascades patternChallenges)
          await prisma.patternChallenge.deleteMany({
            where: { patternId: source.id },
          });
          await prisma.suggestion.deleteMany({
            where: { patternId: source.id },
          });
          await prisma.pattern.delete({ where: { id: source.id } });

          merged++;
          console.log(
            `[refine] Merged "${source.title}" → "${target.title}" (${c.reason})`
          );
        }
      }

      // Process discards
      for (const c of critiques) {
        if (c.decision === "DISCARD" && c.index >= 0 && c.index < patterns.length) {
          const p = patterns[c.index];
          // Only discard if not already deleted by merge
          try {
            await prisma.patternChallenge.deleteMany({
              where: { patternId: p.id },
            });
            await prisma.suggestion.deleteMany({
              where: { patternId: p.id },
            });
            await prisma.pattern.delete({ where: { id: p.id } });
            discarded++;
            console.log(`[refine] Discarded "${p.title}" (${c.reason})`);
          } catch {
            // Already deleted via merge
          }
        }
      }
    }
  } catch (err) {
    console.error("[refine] Self-critique misslyckades (fortsätter med dedup):", err);
  }

  // --- Step 2: Code-based deduplication on remaining patterns ---
  const remaining = await prisma.pattern.findMany({
    where: { workspaceId, status: "EMERGING", source: "AI_DETECTED" },
    include: {
      patternChallenges: { select: { challengeId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (let i = remaining.length - 1; i >= 1; i--) {
    const titleA = remaining[i].title.toLowerCase().trim();
    for (let j = 0; j < i; j++) {
      const titleB = remaining[j].title.toLowerCase().trim();

      const wordsA = new Set(titleA.split(/\s+/));
      const wordsB = new Set(titleB.split(/\s+/));
      const overlap = Array.from(wordsA).filter((w) => wordsB.has(w)).length;
      const similarity = overlap / Math.max(wordsA.size, wordsB.size);

      if (titleA.includes(titleB) || titleB.includes(titleA) || similarity > 0.6) {
        const target = remaining[j];
        const source = remaining[i];
        const existingIds = new Set(
          target.patternChallenges.map((pc) => pc.challengeId)
        );

        const toMove = source.patternChallenges.filter(
          (pc) => !existingIds.has(pc.challengeId)
        );
        if (toMove.length > 0) {
          await prisma.patternChallenge.createMany({
            data: toMove.map((pc) => ({
              patternId: target.id,
              challengeId: pc.challengeId,
            })),
            skipDuplicates: true,
          });
        }

        await prisma.pattern.update({
          where: { id: target.id },
          data: {
            occurrenceCount: target.patternChallenges.length + toMove.length,
          },
        });

        await prisma.patternChallenge.deleteMany({
          where: { patternId: source.id },
        });
        await prisma.suggestion.deleteMany({
          where: { patternId: source.id },
        });
        await prisma.pattern.delete({ where: { id: source.id } });

        console.log(`[refine] Dedup: "${source.title}" → merged into "${target.title}"`);
        merged++;
        remaining.splice(i, 1);
        break;
      }
    }
  }

  return { refined: patterns.length, merged, discarded };
}
