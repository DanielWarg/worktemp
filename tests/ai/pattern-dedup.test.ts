import { describe, it, expect } from "vitest";
import { deduplicatePatterns } from "../../lib/ai/pattern-dedup";

// Helper: create a simple normalized embedding vector
function mockVec(seed: number): number[] {
  const v = new Array(384).fill(0);
  v[seed % 384] = 1;
  return v;
}

// Helper: create a cluster of similar embeddings
function similarVecs(base: number, count: number, noise = 0.01): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const baseVec = new Array(384).fill(0);
  baseVec[base % 384] = 1;
  for (let i = 0; i < count; i++) {
    const vec = baseVec.map((v) => v + (Math.random() - 0.5) * noise);
    map.set(`t${base}-${i}`, vec);
  }
  return map;
}

describe("deduplicatePatterns", () => {
  it("returns input unchanged when < 2 patterns", () => {
    const patterns = [{ ticketIds: ["1", "2"], topics: ["TIMS"] }];
    const embeddings = new Map([["1", mockVec(0)], ["2", mockVec(0)]]);
    expect(deduplicatePatterns(patterns, embeddings)).toHaveLength(1);
  });

  it("does not merge patterns with different centroids", () => {
    const embeddings = new Map([
      ["a1", mockVec(0)], ["a2", mockVec(0)],
      ["b1", mockVec(100)], ["b2", mockVec(100)],
    ]);
    const patterns = [
      { ticketIds: ["a1", "a2"], topics: ["TIMS", "fel"] },
      { ticketIds: ["b1", "b2"], topics: ["TIMS", "fel"] },
    ];
    const result = deduplicatePatterns(patterns, embeddings);
    expect(result).toHaveLength(2); // different centroids → no merge
  });

  it("merges patterns with similar centroids AND overlapping topics", () => {
    const vec = mockVec(42);
    const embeddings = new Map([
      ["a1", vec], ["a2", vec], ["b1", vec], ["b2", vec],
    ]);
    const patterns = [
      { ticketIds: ["a1", "a2"], topics: ["TIMS", "inloggning", "fel"] },
      { ticketIds: ["b1", "b2"], topics: ["TIMS", "fel", "kraschar"] },
    ];
    const result = deduplicatePatterns(patterns, embeddings);
    expect(result).toHaveLength(1);
    expect(result[0].ticketIds).toHaveLength(4);
  });

  it("respects max merged size cap (15)", () => {
    const vec = mockVec(42);
    const embeddings = new Map<string, number[]>();
    const ids1: string[] = [];
    const ids2: string[] = [];
    for (let i = 0; i < 10; i++) {
      ids1.push(`a${i}`);
      embeddings.set(`a${i}`, vec);
    }
    for (let i = 0; i < 8; i++) {
      ids2.push(`b${i}`);
      embeddings.set(`b${i}`, vec);
    }
    const patterns = [
      { ticketIds: ids1, topics: ["TIMS", "fel"] },
      { ticketIds: ids2, topics: ["TIMS", "fel"] },
    ];
    const result = deduplicatePatterns(patterns, embeddings);
    expect(result).toHaveLength(2); // 10 + 8 = 18 > 15, so no merge
  });

  it("does not merge when topics dont overlap", () => {
    const vec = mockVec(42);
    const embeddings = new Map([
      ["a1", vec], ["a2", vec], ["b1", vec], ["b2", vec],
    ]);
    const patterns = [
      { ticketIds: ["a1", "a2"], topics: ["TIMS", "inloggning"] },
      { ticketIds: ["b1", "b2"], topics: ["PubTrans", "nere"] },
    ];
    const result = deduplicatePatterns(patterns, embeddings);
    expect(result).toHaveLength(2); // similar centroids but no topic overlap
  });
});
