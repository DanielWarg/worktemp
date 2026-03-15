import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionAccountId } from "@/lib/auth";

// POST /api/persons/:id/notes — add a note to a person
export async function POST(
  request: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const accountId = getSessionAccountId();
  const body = await request.json();
  const content = (body.content ?? "").trim();

  if (!content) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 }
    );
  }

  const note = await prisma.note.create({
    data: {
      personId,
      authorAccountId: accountId,
      contentRaw: content,
    },
  });

  return NextResponse.json(note, { status: 201 });
}
