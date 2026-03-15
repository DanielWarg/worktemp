import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/crm/connections?workspaceId=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const connections = await prisma.crmConnection.findMany({
    where: { workspaceId },
    select: {
      id: true,
      provider: true,
      displayName: true,
      baseUrl: true,
      lastSyncAt: true,
      syncStatus: true,
      isActive: true,
      createdAt: true,
      _count: { select: { snapshots: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(connections);
}

// POST /api/crm/connections
export async function POST(request: Request) {
  const body = await request.json();
  const { workspaceId, provider, displayName, apiKey, baseUrl } = body;

  if (!workspaceId || !provider || !apiKey) {
    return NextResponse.json(
      { error: "workspaceId, provider, and apiKey are required" },
      { status: 400 }
    );
  }

  const connection = await prisma.crmConnection.create({
    data: {
      workspaceId,
      provider,
      displayName: displayName || provider,
      apiKeyEncrypted: apiKey, // In production: encrypt before storing
      baseUrl: baseUrl ?? null,
    },
  });

  return NextResponse.json(
    { id: connection.id, provider: connection.provider, displayName: connection.displayName },
    { status: 201 }
  );
}
