import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/challenges/:id/tags
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  const { challengeId } = await params;

  const tags = await prisma.challengeTag.findMany({
    where: { challengeId },
    include: { tag: true },
  });

  return NextResponse.json(tags.map((ct) => ct.tag));
}

// POST /api/challenges/:id/tags — add tag to challenge (create tag if needed)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  const { challengeId } = await params;
  const body = await request.json();
  const { tagId, tagName, workspaceId } = body;

  let resolvedTagId = tagId;

  // If tagName provided, find or create tag
  if (!resolvedTagId && tagName && workspaceId) {
    const tag = await prisma.tag.upsert({
      where: { workspaceId_name: { workspaceId, name: tagName.trim() } },
      create: { workspaceId, name: tagName.trim() },
      update: {},
    });
    resolvedTagId = tag.id;
  }

  if (!resolvedTagId) {
    return NextResponse.json(
      { error: "tagId or (tagName + workspaceId) is required" },
      { status: 400 }
    );
  }

  const ct = await prisma.challengeTag.upsert({
    where: { challengeId_tagId: { challengeId, tagId: resolvedTagId } },
    create: { challengeId, tagId: resolvedTagId },
    update: {},
    include: { tag: true },
  });

  return NextResponse.json(ct.tag, { status: 201 });
}

// DELETE /api/challenges/:id/tags — remove tag from challenge
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  const { challengeId } = await params;
  const body = await request.json();
  const { tagId } = body;

  if (!tagId) {
    return NextResponse.json({ error: "tagId is required" }, { status: 400 });
  }

  await prisma.challengeTag.deleteMany({
    where: { challengeId, tagId },
  });

  return NextResponse.json({ ok: true });
}
