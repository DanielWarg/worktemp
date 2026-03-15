import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { normalizeChallenges } from "@/lib/ai/normalize";
import { autoTagChallenges } from "@/lib/ai/auto-tag";
import { detectPatternsAI } from "@/lib/ai/detect-patterns";
import { generateSuggestions } from "@/lib/ai/suggest";
import { normalizeChallengesLocal } from "@/lib/ai/local-normalize";
import { autoTagChallengesLocal } from "@/lib/ai/local-auto-tag";
import { detectPatternsAILocal } from "@/lib/ai/local-detect-patterns";
import { detectPatternsV2 } from "@/lib/ai/local-detect-patterns-v2";
import { detectPatternsV3 } from "@/lib/ai/pattern-detect-v3";
import { generateSuggestionsLocal } from "@/lib/ai/local-suggest";
import { refinePatternsLocal } from "@/lib/ai/local-refine";

// POST /api/ai/analyze — run AI analysis pipeline for a workspace
// provider: "anthropic" (default) or "local" (llama.cpp / Ministral)
// systemContext: optional override — falls back to workspace.systemContext
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
  const requestedSteps: string[] = steps ?? ["normalize", "tag", "patterns", "refine", "suggestions"];
  const results: Record<string, unknown> = { provider };
  const warnings: string[] = [];

  const STEP_LABELS: Record<string, string> = {
    normalize: "Normalisering",
    tag: "Auto-taggning",
    patterns: "Mönsterdetektion (med pre-clustering)",
    refine: "Mönsterförfining",
    suggestions: "Förslagsgenerering",
  };

  try {
    if (requestedSteps.includes("normalize")) {
      const r = isLocal
        ? await normalizeChallengesLocal(workspaceId, ctx)
        : await normalizeChallenges(workspaceId, ctx);
      results.normalize = r;
      if (r.failedBatches) warnings.push(`${STEP_LABELS.normalize}: ${r.failedBatches} av ${r.batches} batchar misslyckades`);
    }

    if (requestedSteps.includes("tag")) {
      const r = isLocal
        ? await autoTagChallengesLocal(workspaceId, ctx)
        : await autoTagChallenges(workspaceId, ctx);
      results.tag = r;
      if (r.failedBatches) warnings.push(`${STEP_LABELS.tag}: ${r.failedBatches} av ${r.batches} batchar misslyckades`);
    }

    if (requestedSteps.includes("patterns")) {
      const r = pipelineVersion === "v3"
        ? await detectPatternsV3(workspaceId)
        : pipelineVersion === "v1"
          ? isLocal
            ? await detectPatternsAILocal(workspaceId, ctx)
            : await detectPatternsAI(workspaceId, ctx)
          : isLocal
            ? await detectPatternsV2(workspaceId, ctx)
            : await detectPatternsAI(workspaceId, ctx);
      results.patterns = r;
      if ("failedBatches" in r && r.failedBatches) warnings.push(`${STEP_LABELS.patterns}: ${r.failedBatches} av ${r.batches} batchar misslyckades`);
    }

    if (requestedSteps.includes("refine") && isLocal) {
      const r = await refinePatternsLocal(workspaceId);
      results.refine = r;
    }

    if (requestedSteps.includes("suggestions")) {
      const r = isLocal
        ? await generateSuggestionsLocal(workspaceId, ctx)
        : await generateSuggestions(workspaceId, ctx);
      results.suggestions = r;
      if (r.failedBatches) warnings.push(`${STEP_LABELS.suggestions}: ${r.failedBatches} av ${r.batches} batchar misslyckades`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai/analyze] Pipeline-fel:", err);
    return NextResponse.json({ error: message, results, warnings, provider }, { status: 502 });
  }

  return NextResponse.json({ ...results, warnings });
}
