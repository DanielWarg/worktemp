import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/persons/:id/challenges — all challenges for a person
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;

  const challenges = await prisma.challenge.findMany({
    where: { personId },
    orderBy: { createdAt: "desc" },
    include: {
      tags: { include: { tag: true } },
      session: { select: { id: true, title: true, startedAt: true } },
    },
  });

  return NextResponse.json(challenges);
}
