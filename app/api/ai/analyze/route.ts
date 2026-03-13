import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { normalizeChallenges } from "@/lib/ai/normalize";
import { autoTagChallenges } from "@/lib/ai/auto-tag";
import { detectPatternsAI } from "@/lib/ai/detect-patterns";
import { generateSuggestions } from "@/lib/ai/suggest";
import { normalizeChallengesLocal } from "@/lib/ai/local-normalize";
import { autoTagChallengesLocal } from "@/lib/ai/local-auto-tag";
import { detectPatternsAILocal } from "@/lib/ai/local-detect-patterns";
import { generateSuggestionsLocal } from "@/lib/ai/local-suggest";

// POST /api/ai/analyze — run AI analysis pipeline for a workspace
// provider: "anthropic" (default) or "local" (llama.cpp / Ministral)
// systemContext: optional override — falls back to workspace.systemContext
export async function POST(request: Request) {
  const body = await request.json();
  const { workspaceId, steps, provider = "anthropic", systemContext } = body;

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
  const requestedSteps: string[] = steps ?? ["normalize", "tag", "patterns", "suggestions"];
  const results: Record<string, unknown> = { provider };

  try {
    if (requestedSteps.includes("normalize")) {
      results.normalize = isLocal
        ? await normalizeChallengesLocal(workspaceId, ctx)
        : await normalizeChallenges(workspaceId, ctx);
    }

    if (requestedSteps.includes("tag")) {
      results.tag = isLocal
        ? await autoTagChallengesLocal(workspaceId, ctx)
        : await autoTagChallenges(workspaceId, ctx);
    }

    if (requestedSteps.includes("patterns")) {
      results.patterns = isLocal
        ? await detectPatternsAILocal(workspaceId, ctx)
        : await detectPatternsAI(workspaceId, ctx);
    }

    if (requestedSteps.includes("suggestions")) {
      results.suggestions = isLocal
        ? await generateSuggestionsLocal(workspaceId, ctx)
        : await generateSuggestions(workspaceId, ctx);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, results, provider }, { status: 502 });
  }

  return NextResponse.json(results);
}
