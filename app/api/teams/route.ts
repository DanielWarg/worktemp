import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// POST /api/teams — create a team in a workspace
export async function POST(request: Request) {
  const body = await request.json();
  const { workspaceId, name, color } = body;

  if (!workspaceId || !name?.trim()) {
    return NextResponse.json(
      { error: "workspaceId and name are required" },
      { status: 400 }
    );
  }

  const maxOrder = await prisma.team.aggregate({
    where: { workspaceId },
    _max: { sortOrder: true },
  });

  const team = await prisma.team.create({
    data: {
      workspaceId,
      name: name.trim(),
      color: color ?? "#5BBFA0",
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json(team, { status: 201 });
}
