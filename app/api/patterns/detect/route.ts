import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// POST /api/patterns/detect — run simple pattern detection for a workspace
// Groups challenges by tag, flags tags appearing in 3+ sessions or from 3+ persons
export async function POST(request: Request) {
  const body = await request.json();
  const { workspaceId } = body;

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  // Get all challenges with tags, persons, and sessions
  const challenges = await prisma.challenge.findMany({
    where: { workspaceId },
    include: {
      tags: { include: { tag: true } },
      person: { select: { id: true, name: true } },
      session: { select: { id: true } },
    },
  });

  // Group by tag
  const tagStats = new Map<
    string,
    {
      tagId: string;
      tagName: string;
      challengeIds: string[];
      personIds: Set<string>;
      sessionIds: Set<string>;
    }
  >();

  for (const challenge of challenges) {
    for (const ct of challenge.tags) {
      const key = ct.tag.id;
      if (!tagStats.has(key)) {
        tagStats.set(key, {
          tagId: ct.tag.id,
          tagName: ct.tag.name,
          challengeIds: [],
          personIds: new Set(),
          sessionIds: new Set(),
        });
      }
      const stat = tagStats.get(key)!;
      stat.challengeIds.push(challenge.id);
      stat.personIds.add(challenge.person.id);
      if (challenge.session?.id) stat.sessionIds.add(challenge.session.id);
    }
  }

  const created: string[] = [];

  for (const [, stat] of tagStats) {
    const crossSession = stat.sessionIds.size >= 3;
    const crossPerson = stat.personIds.size >= 3;

    if (!crossSession && !crossPerson) continue;

    // Check if pattern already exists for this tag
    const existing = await prisma.pattern.findFirst({
      where: {
        workspaceId,
        title: stat.tagName,
        source: "MANUAL",
      },
    });

    if (existing) {
      // Update existing: add new challenges
      const existingLinks = await prisma.patternChallenge.findMany({
        where: { patternId: existing.id },
        select: { challengeId: true },
      });
      const existingIds = new Set(existingLinks.map((l) => l.challengeId));
      const newIds = stat.challengeIds.filter((id) => !existingIds.has(id));

      if (newIds.length > 0) {
        await prisma.patternChallenge.createMany({
          data: newIds.map((challengeId) => ({ patternId: existing.id, challengeId })),
          skipDuplicates: true,
        });
        await prisma.pattern.update({
          where: { id: existing.id },
          data: {
            occurrenceCount: existingIds.size + newIds.length,
            lastSeenAt: new Date(),
          },
        });
      }
      continue;
    }

    // Create new pattern
    const patternType = crossPerson ? "CROSS_PERSON" : "RECURRING";
    const pattern = await prisma.pattern.create({
      data: {
        workspaceId,
        title: stat.tagName,
        description: crossPerson
          ? `${stat.personIds.size} personer har lyft denna utmaning`
          : `Dyker upp i ${stat.sessionIds.size} möten`,
        patternType,
        source: "MANUAL",
        status: "EMERGING",
        occurrenceCount: stat.challengeIds.length,
        patternChallenges: {
          create: stat.challengeIds.map((challengeId) => ({ challengeId })),
        },
      },
    });
    created.push(pattern.id);
  }

  return NextResponse.json({ detected: created.length, patternIds: created });
}
