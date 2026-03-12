import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/tags?workspaceId=xxx — list all tags for workspace
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const tags = await prisma.tag.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    include: { _count: { select: { challenges: true } } },
  });

  return NextResponse.json(tags);
}

// POST /api/tags — create a tag
export async function POST(request: Request) {
  const body = await request.json();
  const { workspaceId, name, color } = body;

  if (!workspaceId || !name?.trim()) {
    return NextResponse.json(
      { error: "workspaceId and name are required" },
      { status: 400 }
    );
  }

  const tag = await prisma.tag.upsert({
    where: { workspaceId_name: { workspaceId, name: name.trim() } },
    create: { workspaceId, name: name.trim(), color: color ?? null },
    update: {},
  });

  return NextResponse.json(tag, { status: 201 });
}
