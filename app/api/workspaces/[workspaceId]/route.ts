import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/workspaces/:id — full workspace with teams, memberships, and people
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      teams: {
        orderBy: { sortOrder: "asc" },
        include: {
          memberships: {
            orderBy: { sortOrder: "asc" },
            include: {
              person: {
                include: {
                  notes: { orderBy: { createdAt: "desc" } },
                  attachments: { orderBy: { createdAt: "desc" } },
                  challenges: {
                    orderBy: { createdAt: "desc" },
                    include: { tags: { include: { tag: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(workspace);
}

// PATCH /api/workspaces/:id — update workspace fields
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.systemContext === "string") data.systemContext = body.systemContext;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data,
  });

  return NextResponse.json(workspace);
}
