import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/challenges/:id — update challenge status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  const { challengeId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.contentRaw !== undefined) data.contentRaw = body.contentRaw;

  const challenge = await prisma.challenge.update({
    where: { id: challengeId },
    data,
  });

  return NextResponse.json(challenge);
}

// DELETE /api/challenges/:id
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  const { challengeId } = await params;

  await prisma.challenge.delete({ where: { id: challengeId } });

  return NextResponse.json({ ok: true });
}
