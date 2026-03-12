import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// POST /api/challenges — create a standalone challenge (outside meeting)
export async function POST(request: Request) {
  const body = await request.json();
  const { personId, workspaceId, contentRaw, sourceType } = body;

  if (!personId || !workspaceId || !contentRaw?.trim()) {
    return NextResponse.json(
      { error: "personId, workspaceId, and contentRaw are required" },
      { status: 400 }
    );
  }

  const [challenge] = await prisma.$transaction([
    prisma.challenge.create({
      data: {
        personId,
        workspaceId,
        contentRaw: contentRaw.trim(),
        sourceType: sourceType ?? "BETWEEN_MEETINGS",
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
