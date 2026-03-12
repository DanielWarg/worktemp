import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncCrmConnection, matchCrmToPatterns } from "@/lib/crm/sync";

// POST /api/crm/sync — sync a connection or all active connections for a workspace
export async function POST(request: Request) {
  const body = await request.json();
  const { connectionId, workspaceId } = body;

  const results: { connectionId: string; result: unknown }[] = [];

  if (connectionId) {
    const result = await syncCrmConnection(connectionId);
    results.push({ connectionId, result });
  } else if (workspaceId) {
    const connections = await prisma.crmConnection.findMany({
      where: { workspaceId, isActive: true },
    });
    for (const conn of connections) {
      const result = await syncCrmConnection(conn.id);
      results.push({ connectionId: conn.id, result });
    }
  } else {
    return NextResponse.json(
      { error: "connectionId or workspaceId is required" },
      { status: 400 }
    );
  }

  // After sync, match CRM data to patterns
  if (workspaceId) {
    await matchCrmToPatterns(workspaceId);
  } else if (connectionId) {
    const conn = await prisma.crmConnection.findUnique({
      where: { id: connectionId },
      select: { workspaceId: true },
    });
    if (conn) await matchCrmToPatterns(conn.workspaceId);
  }

  return NextResponse.json({ results });
}
