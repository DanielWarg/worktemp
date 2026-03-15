import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionAccountId } from "@/lib/auth";

// GET /api/meetings?workspaceId=xxx — list meetings
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const meetings = await prisma.meetingSession.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      startedAt: true,
      endedAt: true,
      _count: { select: { challenges: true, participants: true } },
    },
  });

  return NextResponse.json(meetings);
}

// POST /api/meetings — create a new meeting session
export async function POST(request: Request) {
  const facilitatorId = getSessionAccountId();
  const body = await request.json();
  const { workspaceId, teamId, title } = body;

  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400 }
    );
  }

  const session = await prisma.meetingSession.create({
    data: {
      workspaceId,
      teamId: teamId ?? null,
      title: title ?? null,
      facilitatorId,
      status: "PLANNED",
    },
    include: {
      challenges: true,
      participants: true,
    },
  });

  return NextResponse.json(session, { status: 201 });
}
