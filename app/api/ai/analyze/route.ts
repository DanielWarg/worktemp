import { NextResponse } from "next/server";
import { normalizeChallenges } from "@/lib/ai/normalize";
import { autoTagChallenges } from "@/lib/ai/auto-tag";
import { detectPatternsAI } from "@/lib/ai/detect-patterns";
import { generateSuggestions } from "@/lib/ai/suggest";

// POST /api/ai/analyze — run full AI analysis pipeline for a workspace
export async function POST(request: Request) {
  const body = await request.json();
  const { workspaceId, steps } = body;

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const requestedSteps: string[] = steps ?? ["normalize", "tag", "patterns", "suggestions"];
  const results: Record<string, unknown> = {};

  if (requestedSteps.includes("normalize")) {
    results.normalize = await normalizeChallenges(workspaceId);
  }

  if (requestedSteps.includes("tag")) {
    results.tag = await autoTagChallenges(workspaceId);
  }

  if (requestedSteps.includes("patterns")) {
    results.patterns = await detectPatternsAI(workspaceId);
  }

  if (requestedSteps.includes("suggestions")) {
    results.suggestions = await generateSuggestions(workspaceId);
  }

  return NextResponse.json(results);
}
