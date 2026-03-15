import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/persons/:id — update person fields
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.roleTitle !== undefined) data.roleTitle = body.roleTitle;
  if (body.summaryText !== undefined) data.summaryText = body.summaryText;

  const person = await prisma.person.update({
    where: { id: personId },
    data,
  });

  return NextResponse.json(person);
}

// DELETE /api/persons/:id
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;

  await prisma.person.delete({ where: { id: personId } });

  return NextResponse.json({ ok: true });
}
