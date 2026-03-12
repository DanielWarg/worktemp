import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/teams/:id — update team name/color
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.color !== undefined) data.color = body.color;

  const team = await prisma.team.update({
    where: { id: teamId },
    data,
  });

  return NextResponse.json(team);
}

// DELETE /api/teams/:id
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;

  await prisma.team.delete({ where: { id: teamId } });

  return NextResponse.json({ ok: true });
}
