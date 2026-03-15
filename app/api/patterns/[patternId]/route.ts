import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

const VALID_STATUSES = new Set(["EMERGING", "CONFIRMED", "ADDRESSED", "DISMISSED"]);
const VALID_TYPES = new Set(["RECURRING", "ESCALATING", "CROSS_PERSON", "CROSS_TEAM"]);

// PATCH /api/patterns/:id — update pattern
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  const { patternId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title).slice(0, 200);
  if (body.description !== undefined) data.description = String(body.description).slice(0, 2000);
  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(", ")}` }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.patternType !== undefined) {
    if (!VALID_TYPES.has(body.patternType)) {
      return NextResponse.json({ error: `Invalid patternType. Must be one of: ${[...VALID_TYPES].join(", ")}` }, { status: 400 });
    }
    data.patternType = body.patternType;
  }

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
