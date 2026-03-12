import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionAccountId } from "@/lib/auth";

// POST /api/persons — create a person and add to a team
export async function POST(request: Request) {
  const accountId = getSessionAccountId();
  const body = await request.json();
  const { workspaceId, teamId, name } = body;

  if (!workspaceId || !teamId || !name?.trim()) {
    return NextResponse.json(
      { error: "workspaceId, teamId, and name are required" },
      { status: 400 }
    );
  }

  const maxOrder = await prisma.teamMembership.aggregate({
    where: { teamId },
    _max: { sortOrder: true },
  });

  const person = await prisma.person.create({
    data: {
      workspaceId,
      name: name.trim(),
      roleTitle: "Ange roll",
      summaryText: "",
      createdById: accountId,
      memberships: {
        create: {
          teamId,
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        },
      },
    },
    include: {
      memberships: true,
      notes: true,
      attachments: { include: { comments: true } },
    },
  });

  return NextResponse.json(person, { status: 201 });
}
