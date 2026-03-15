import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/suggestions/:id — update suggestion status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ suggestionId: string }> }
) {
  const { suggestionId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;

  const suggestion = await prisma.suggestion.update({
    where: { id: suggestionId },
    data,
  });

  return NextResponse.json(suggestion);
}
