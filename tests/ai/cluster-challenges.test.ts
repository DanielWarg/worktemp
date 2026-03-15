import { describe, it, expect } from "vitest";
import { clusterChallenges } from "../../lib/ai/cluster-challenges";

// Helper: create a normalized embedding pointing in direction `dim`
function unitVec(dim: number): number[] {
  const v = new Array(384).fill(0);
  v[dim % 384] = 1;
  return v;
}

describe("clusterChallenges", () => {
  it("returns single cluster when items <= targetMax", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}` }));
    const embeddings = new Map(items.map((item, i) => [item.id, unitVec(i)]));
    const result = clusterChallenges(items, embeddings);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(10);
  });

  it("splits dissimilar items into multiple clusters", () => {
    // Create 20 items in 2 distinct groups (different embedding directions)
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}` }));
    const embeddings = new Map<string, number[]>();
    for (let i = 0; i < 10; i++) embeddings.set(`t${i}`, unitVec(0));     // group A
    for (let i = 10; i < 20; i++) embeddings.set(`t${i}`, unitVec(100));  // group B

    const result = clusterChallenges(items, embeddings);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("never exceeds targetMax per cluster", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}` }));
    // All similar — should still respect hard cap
    const vec = unitVec(42);
    const embeddings = new Map(items.map((item) => [item.id, vec]));

    const result = clusterChallenges(items, embeddings, { targetMax: 12 });
    for (const cluster of result) {
      expect(cluster.length).toBeLessThanOrEqual(12);
    }
  });

  it("falls back to chunks when embeddings are missing", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}` }));
    const embeddings = new Map<string, number[]>(); // empty = all missing

    const result = clusterChallenges(items, embeddings);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // All items should be present
    const allIds = result.flatMap((c) => c.map((item) => item.id));
    expect(allIds).toHaveLength(20);
  });

  it("respects custom thresholds", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}` }));
    const vec = unitVec(0);
    const embeddings = new Map(items.map((item) => [item.id, vec]));

    // Very high threshold = everything stays separate
    const result = clusterChallenges(items, embeddings, {
      similarityThreshold: 0.99,
      targetMax: 5,
    });
    for (const cluster of result) {
      expect(cluster.length).toBeLessThanOrEqual(5);
    }
  });
});
