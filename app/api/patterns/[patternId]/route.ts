import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/patterns/:id — update pattern
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  const { patternId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.status !== undefined) data.status = body.status;
  if (body.patternType !== undefined) data.patternType = body.patternType;

  const pattern = await prisma.pattern.update({
    where: { id: patternId },
    data,
  });

  return NextResponse.json(pattern);
}

// DELETE /api/patterns/:id
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  const { patternId } = await params;

  await prisma.pattern.delete({ where: { id: patternId } });

  return NextResponse.json({ ok: true });
}
