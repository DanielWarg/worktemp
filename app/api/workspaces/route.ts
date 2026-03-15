import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionAccountId } from "@/lib/auth";

// GET /api/workspaces — list workspaces for the current user
export async function GET() {
  const accountId = getSessionAccountId();

  const workspaces = await prisma.workspace.findMany({
    where: { ownerId: accountId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(workspaces);
}

// POST /api/workspaces — create a new workspace
export async function POST(request: Request) {
  const accountId = getSessionAccountId();
  const body = await request.json();
  const name = (body.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const workspace = await prisma.workspace.create({
    data: { name, ownerId: accountId },
  });

  return NextResponse.json(workspace, { status: 201 });
}
