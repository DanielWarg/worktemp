import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// POST /api/patterns/:id/challenges — add challenge to pattern
export async function POST(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  const { patternId } = await params;
  const body = await request.json();
  const { challengeId } = body;

  if (!challengeId) {
    return NextResponse.json({ error: "challengeId is required" }, { status: 400 });
  }

  await prisma.patternChallenge.upsert({
    where: { patternId_challengeId: { patternId, challengeId } },
    create: { patternId, challengeId },
    update: {},
  });

  // Update occurrence count
  const count = await prisma.patternChallenge.count({ where: { patternId } });
  await prisma.pattern.update({
    where: { id: patternId },
    data: { occurrenceCount: count, lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/patterns/:id/challenges — remove challenge from pattern
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  const { patternId } = await params;
  const body = await request.json();
  const { challengeId } = body;

  await prisma.patternChallenge.deleteMany({
    where: { patternId, challengeId },
  });

  const count = await prisma.patternChallenge.count({ where: { patternId } });
  await prisma.pattern.update({
    where: { id: patternId },
    data: { occurrenceCount: count },
  });

  return NextResponse.json({ ok: true });
}
