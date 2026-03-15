import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// DELETE /api/imports/:importId — remove import and all linked data
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> }
) {
  const { importId } = await params;

  const imp = await prisma.historicalImport.findUnique({
    where: { id: importId },
    select: { id: true, sourceLabel: true },
  });

  if (!imp) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  // Find all challenges from this import
  const challengeIds = await prisma.challenge.findMany({
    where: { importId },
    select: { id: true },
  });
  const ids = challengeIds.map((c) => c.id);

  // Transaction: delete challenges (cascades to ChallengeTag + PatternChallenge),
  // then clean up empty patterns, then delete import record
  await prisma.$transaction(async (tx) => {
    if (ids.length > 0) {
      // ChallengeTag and PatternChallenge cascade-delete with Challenge
      await tx.challenge.deleteMany({ where: { id: { in: ids } } });

      // Remove patterns that no longer have any linked challenges
      const emptyPatterns = await tx.pattern.findMany({
        where: { patternChallenges: { none: {} } },
        select: { id: true },
      });
      if (emptyPatterns.length > 0) {
        const emptyIds = emptyPatterns.map((p) => p.id);
        // Suggestions cascade-delete with Pattern
        await tx.pattern.deleteMany({ where: { id: { in: emptyIds } } });
      }
    }

    await tx.historicalImport.delete({ where: { id: importId } });
  });

  return NextResponse.json({
    deleted: {
      challenges: ids.length,
      importId,
    },
  });
}
