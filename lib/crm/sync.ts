import { prisma } from "@/lib/db/prisma";
import { CRM_PROVIDERS } from "./providers";

// Run sync for a CRM connection — fetch tickets and create snapshots
export async function syncCrmConnection(connectionId: string) {
  const connection = await prisma.crmConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection || !connection.isActive) {
    return { error: "Connection not found or inactive" };
  }

  const syncFn = CRM_PROVIDERS[connection.provider];
  if (!syncFn) {
    return { error: `Unknown provider: ${connection.provider}` };
  }

  // Update status to syncing
  await prisma.crmConnection.update({
    where: { id: connectionId },
    data: { syncStatus: "SYNCING" },
  });

  const result = await syncFn(
    connection.baseUrl || "",
    connection.apiKeyEncrypted // In production, decrypt this
  );

  if (result.error) {
    await prisma.crmConnection.update({
      where: { id: connectionId },
      data: { syncStatus: "ERROR" },
    });
    return { error: result.error };
  }

  // Create snapshots
  const snapshotDate = new Date();
  for (const cat of result.categories) {
    await prisma.crmSnapshot.create({
      data: {
        connectionId,
        snapshotDate,
        category: cat.category,
        ticketCount: cat.ticketCount,
        avgResolutionHours: cat.avgResolutionHours ?? null,
      },
    });
  }

  await prisma.crmConnection.update({
    where: { id: connectionId },
    data: {
      syncStatus: "IDLE",
      lastSyncAt: snapshotDate,
    },
  });

  return { synced: result.categories.length };
}

// Match CRM data to patterns — enrich patterns with CRM evidence
export async function matchCrmToPatterns(workspaceId: string) {
  const connections = await prisma.crmConnection.findMany({
    where: { workspaceId, isActive: true },
  });

  if (connections.length === 0) return { matched: 0 };

  const patterns = await prisma.pattern.findMany({
    where: { workspaceId, status: { in: ["EMERGING", "CONFIRMED"] } },
    include: {
      patternChallenges: {
        include: {
          challenge: {
            include: { tags: { include: { tag: true } } },
          },
        },
      },
    },
  });

  let matched = 0;

  for (const pattern of patterns) {
    // Collect all tag names from the pattern's challenges
    const tagNames = new Set<string>();
    for (const pc of pattern.patternChallenges) {
      for (const ct of pc.challenge.tags) {
        tagNames.add(ct.tag.name.toLowerCase());
      }
    }

    for (const connection of connections) {
      // Get recent snapshots
      const snapshots = await prisma.crmSnapshot.findMany({
        where: {
          connectionId: connection.id,
          snapshotDate: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { snapshotDate: "desc" },
      });

      // Find matching categories
      for (const snapshot of snapshots) {
        const catLower = snapshot.category.toLowerCase();
        const isMatch = [...tagNames].some(
          (tag) => catLower.includes(tag) || tag.includes(catLower)
        );

        if (!isMatch) continue;

        // Check if evidence already exists
        const existing = await prisma.patternCrmEvidence.findUnique({
          where: { patternId_snapshotId: { patternId: pattern.id, snapshotId: snapshot.id } },
        });

        if (existing) continue;

        await prisma.patternCrmEvidence.create({
          data: {
            patternId: pattern.id,
            snapshotId: snapshot.id,
            narrative: `${connection.displayName}: ${snapshot.ticketCount} ärenden i kategorin "${snapshot.category}"`,
          },
        });
        matched++;
      }
    }
  }

  return { matched };
}
