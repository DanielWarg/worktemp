import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { normalizeChallenges } from "@/lib/ai/normalize";
import { autoTagChallenges } from "@/lib/ai/auto-tag";
import { detectPatternsAI } from "@/lib/ai/detect-patterns";
import { generateSuggestions } from "@/lib/ai/suggest";
import { detectPatternsV3 } from "@/lib/ai/pattern-detect-v3";
import { detectPatternsV4 } from "@/lib/ai/pattern-detect-v4";

// POST /api/ai/analyze — run AI analysis pipeline for a workspace
// provider: "anthropic" (default) or "local" (v4 pipeline, fully local)
// pipelineVersion: "v3" for explicit fallback
export async function POST(request: Request) {
  const body = await request.json();
  const { workspaceId, steps, provider = "anthropic", systemContext, pipelineVersion } = body;

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  // Resolve context: explicit param > workspace field > empty
  let ctx = typeof systemContext === "string" ? systemContext.trim() : "";
  if (!ctx) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { systemContext: true },
    });
    ctx = ws?.systemContext?.trim() ?? "";
  }

  const isLocal = provider === "local";
  const requestedSteps: string[] = steps ?? ["patterns"];
  const results: Record<string, unknown> = { provider };
  const warnings: string[] = [];

  try {
    if (requestedSteps.includes("normalize") && !isLocal) {
      const r = await normalizeChallenges(workspaceId, ctx);
      results.normalize = r;
      if (r.failedBatches) warnings.push(`Normalisering: ${r.failedBatches} av ${r.batches} batchar misslyckades`);
    }

    if (requestedSteps.includes("tag") && !isLocal) {
      const r = await autoTagChallenges(workspaceId, ctx);
      results.tag = r;
      if (r.failedBatches) warnings.push(`Auto-taggning: ${r.failedBatches} av ${r.batches} batchar misslyckades`);
    }

    if (requestedSteps.includes("patterns")) {
      const r = isLocal
        ? pipelineVersion === "v3"
          ? await detectPatternsV3(workspaceId)
          : await detectPatternsV4(workspaceId)
        : await detectPatternsAI(workspaceId, ctx);
      results.patterns = r;
    }

    if (requestedSteps.includes("suggestions") && !isLocal) {
      const r = await generateSuggestions(workspaceId, ctx);
      results.suggestions = r;
      if (r.failedBatches) warnings.push(`Förslagsgenerering: ${r.failedBatches} av ${r.batches} batchar misslyckades`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai/analyze] Pipeline-fel:", err);
    return NextResponse.json({ error: message, results, warnings, provider }, { status: 502 });
  }

  return NextResponse.json({ ...results, warnings });
}
