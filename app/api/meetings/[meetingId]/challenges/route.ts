import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// POST /api/meetings/:id/challenges — quick capture (person + text)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  const body = await request.json();
  const { personId, contentRaw } = body;

  if (!personId || !contentRaw?.trim()) {
    return NextResponse.json(
      { error: "personId and contentRaw are required" },
      { status: 400 }
    );
  }

  // Get session to find workspaceId
  const session = await prisma.meetingSession.findUnique({
    where: { id: meetingId },
    select: { workspaceId: true },
  });

  if (!session) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Ensure participant exists
  await prisma.meetingParticipant.upsert({
    where: { sessionId_personId: { sessionId: meetingId, personId } },
    create: { sessionId: meetingId, personId },
    update: {},
  });

  // Create challenge and update person's lastActiveAt
  const [challenge] = await prisma.$transaction([
    prisma.challenge.create({
      data: {
        sessionId: meetingId,
        personId,
        workspaceId: session.workspaceId,
        contentRaw: contentRaw.trim(),
        sourceType: "MEETING",
        status: "OPEN",
      },
    }),
    prisma.person.update({
      where: { id: personId },
      data: { lastActiveAt: new Date() },
    }),
  ]);

  return NextResponse.json(challenge, { status: 201 });
}
