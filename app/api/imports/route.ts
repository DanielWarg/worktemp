import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionAccountId } from "@/lib/auth";

// POST /api/imports — create historical import, parse into challenges
export async function POST(request: Request) {
  const accountId = getSessionAccountId();
  const body = await request.json();
  const { workspaceId, personId, sourceLabel, rawContent } = body;

  if (!workspaceId || !personId || !rawContent?.trim()) {
    return NextResponse.json(
      { error: "workspaceId, personId, and rawContent are required" },
      { status: 400 }
    );
  }

  // Parse: split on newlines, each non-empty line becomes a challenge
  const lines = rawContent
    .split(/\n/)
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  const importRecord = await prisma.historicalImport.create({
    data: {
      workspaceId,
      importedById: accountId,
      sourceLabel: sourceLabel || "Manuell import",
      rawContent,
      parsedCount: lines.length,
      status: "COMPLETED",
    },
  });

  // Create challenges in bulk
  if (lines.length > 0) {
    await prisma.challenge.createMany({
      data: lines.map((line: string) => ({
        personId,
        workspaceId,
        contentRaw: line,
        sourceType: "HISTORICAL",
        status: "OPEN",
      })),
    });

    await prisma.person.update({
      where: { id: personId },
      data: { lastActiveAt: new Date() },
    });
  }

  return NextResponse.json(
    { ...importRecord, parsedCount: lines.length },
    { status: 201 }
  );
}
