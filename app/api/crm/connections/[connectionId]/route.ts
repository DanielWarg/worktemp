import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/crm/connections/:id
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.displayName !== undefined) data.displayName = body.displayName;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.baseUrl !== undefined) data.baseUrl = body.baseUrl;

  const connection = await prisma.crmConnection.update({
    where: { id: connectionId },
    data,
  });

  return NextResponse.json(connection);
}

// DELETE /api/crm/connections/:id
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;

  await prisma.crmConnection.delete({ where: { id: connectionId } });

  return NextResponse.json({ ok: true });
}
