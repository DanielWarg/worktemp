import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// POST /api/persons/:id/move — move a person to a different team
export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const body = await request.json();
  const { fromTeamId, toTeamId } = body;

  if (!fromTeamId || !toTeamId) {
    return NextResponse.json(
      { error: "fromTeamId and toTeamId are required" },
      { status: 400 }
    );
  }

  // Delete existing membership
  await prisma.teamMembership.deleteMany({
    where: { personId, teamId: fromTeamId },
  });

  const maxOrder = await prisma.teamMembership.aggregate({
    where: { teamId: toTeamId },
    _max: { sortOrder: true },
  });

  // Create new membership
  await prisma.teamMembership.create({
    data: {
      personId,
      teamId: toTeamId,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json({ ok: true });
}
