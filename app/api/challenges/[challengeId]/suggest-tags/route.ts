import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/challenges/:id/suggest-tags — suggest 2-3 tags based on content similarity
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  const { challengeId } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { contentRaw: true, contentNormalized: true, workspaceId: true },
  });

  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }

  // Get all tagged challenges in this workspace (excluding this one)
  const taggedChallenges = await prisma.challenge.findMany({
    where: {
      workspaceId: challenge.workspaceId,
      id: { not: challengeId },
      tags: { some: {} },
    },
    select: {
      contentRaw: true,
      contentNormalized: true,
      tags: { include: { tag: { select: { id: true, name: true } } } },
    },
  });

  if (taggedChallenges.length === 0) {
    // No tagged challenges to learn from — suggest most used tags
    const topTags = await prisma.tag.findMany({
      where: { workspaceId: challenge.workspaceId },
      orderBy: { challenges: { _count: "desc" } },
      take: 3,
      select: { id: true, name: true },
    });
    return NextResponse.json(topTags);
  }

  // Simple word-overlap scoring
  const targetWords = extractWords(challenge.contentNormalized || challenge.contentRaw);
  const tagScores = new Map<string, { id: string; name: string; score: number }>();

  for (const tc of taggedChallenges) {
    const words = extractWords(tc.contentNormalized || tc.contentRaw);
    const overlap = countOverlap(targetWords, words);
    if (overlap === 0) continue;

    for (const ct of tc.tags) {
      const existing = tagScores.get(ct.tag.id);
      if (existing) {
        existing.score += overlap;
      } else {
        tagScores.set(ct.tag.id, { id: ct.tag.id, name: ct.tag.name, score: overlap });
      }
    }
  }

  // Sort by score, return top 3
  const suggestions = [...tagScores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ id, name }) => ({ id, name }));

  return NextResponse.json(suggestions);
}

// Stop words for Swedish
const STOP_WORDS = new Set([
  "och", "i", "att", "en", "ett", "det", "som", "på", "är", "av", "för",
  "med", "till", "den", "har", "inte", "om", "de", "vi", "kan", "var",
  "från", "så", "men", "alla", "ska", "här", "vid", "eller", "hur",
  "efter", "upp", "ut", "där", "in", "sig", "över", "under", "utan",
  "när", "vad", "mer", "man", "sin", "sin", "sina", "sedan", "mot",
  "nu", "bara", "än", "mycket", "också", "andra", "samma", "the",
  "and", "is", "in", "to", "of", "a", "for", "that", "with", "on",
]);

function extractWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const word of a) {
    if (b.has(word)) count++;
  }
  return count;
}
