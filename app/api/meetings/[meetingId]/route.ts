import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/meetings/:id — get session with challenges and participants
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  const session = await prisma.meetingSession.findUnique({
    where: { id: meetingId },
    include: {
      challenges: {
        orderBy: { createdAt: "desc" },
        include: { person: { select: { id: true, name: true } } },
      },
      participants: {
        include: { person: { select: { id: true, name: true } } },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}

// PATCH /api/meetings/:id — update session (start/end/title)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;

  if (body.status === "ACTIVE") {
    data.status = "ACTIVE";
    data.startedAt = new Date();
  } else if (body.status === "COMPLETED") {
    data.status = "COMPLETED";
    data.endedAt = new Date();
  }

  const session = await prisma.meetingSession.update({
    where: { id: meetingId },
    data,
    include: {
      challenges: { orderBy: { createdAt: "desc" } },
      participants: true,
    },
  });

  return NextResponse.json(session);
}
