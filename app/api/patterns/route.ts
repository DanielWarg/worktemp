import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/patterns?workspaceId=xxx — list patterns for workspace
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const patterns = await prisma.pattern.findMany({
    where: { workspaceId },
    orderBy: { lastSeenAt: "desc" },
    include: {
      patternChallenges: {
        include: {
          challenge: {
            include: {
              person: { select: { id: true, name: true } },
              tags: { include: { tag: true } },
              session: { select: { id: true, title: true, startedAt: true } },
            },
          },
        },
      },
      suggestions: { orderBy: { createdAt: "desc" } },
      crmEvidence: {
        include: { snapshot: true },
      },
    },
  });

  return NextResponse.json(patterns);
}

// POST /api/patterns — create a pattern manually, linking challenges
export async function POST(request: Request) {
  const body = await request.json();
  const { workspaceId, title, description, patternType, challengeIds } = body;

  if (!workspaceId || !title?.trim()) {
    return NextResponse.json(
      { error: "workspaceId and title are required" },
      { status: 400 }
    );
  }

  const ids: string[] = challengeIds ?? [];

  const pattern = await prisma.pattern.create({
    data: {
      workspaceId,
      title: title.trim(),
      description: description ?? null,
      patternType: patternType ?? "RECURRING",
      source: "MANUAL",
      status: "EMERGING",
      occurrenceCount: ids.length,
      patternChallenges: {
        create: ids.map((challengeId: string) => ({ challengeId })),
      },
    },
    include: {
      patternChallenges: {
        include: { challenge: { include: { person: { select: { id: true, name: true } } } } },
      },
    },
  });

  return NextResponse.json(pattern, { status: 201 });
}
