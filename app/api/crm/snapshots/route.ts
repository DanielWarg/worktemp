import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/crm/snapshots?connectionId=xxx — get snapshots for a connection
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connectionId");

  if (!connectionId) {
    return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
  }

  const snapshots = await prisma.crmSnapshot.findMany({
    where: { connectionId },
    orderBy: { snapshotDate: "desc" },
    take: 100,
  });

  return NextResponse.json(snapshots);
}
