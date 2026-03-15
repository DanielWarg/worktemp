import { describe, it, expect } from "vitest";
import { calcTrend, calcScope, calcScopeByOrg, calcConfidence } from "../../lib/ai/trend-calc";

describe("calcTrend", () => {
  it("returns ISOLATED for < 3 dates", () => {
    expect(calcTrend([])).toBe("ISOLATED");
    expect(calcTrend([new Date()])).toBe("ISOLATED");
    expect(calcTrend([new Date(), new Date()])).toBe("ISOLATED");
  });

  it("returns ISOLATED when all within 7 days", () => {
    const base = new Date("2026-03-01");
    const dates = [
      base,
      new Date(base.getTime() + 86400000 * 2),
      new Date(base.getTime() + 86400000 * 5),
    ];
    expect(calcTrend(dates)).toBe("ISOLATED");
  });

  it("returns ESCALATING when second half has 2x+ more", () => {
    const dates = [
      new Date("2026-01-01"),
      new Date("2026-02-15"),
      new Date("2026-02-20"),
      new Date("2026-02-25"),
      new Date("2026-03-01"),
    ];
    expect(calcTrend(dates)).toBe("ESCALATING");
  });

  it("returns RECURRING for steady spread", () => {
    const dates = [
      new Date("2026-01-01"),
      new Date("2026-01-15"),
      new Date("2026-02-01"),
      new Date("2026-02-15"),
      new Date("2026-03-01"),
    ];
    expect(calcTrend(dates)).toBe("RECURRING");
  });
});

describe("calcScope", () => {
  it("returns SINGLE for 0-1 persons", () => {
    expect(calcScope(0)).toBe("SINGLE");
    expect(calcScope(1)).toBe("SINGLE");
  });

  it("returns CROSS_PERSON for 2-3", () => {
    expect(calcScope(2)).toBe("CROSS_PERSON");
    expect(calcScope(3)).toBe("CROSS_PERSON");
  });

  it("returns CROSS_TEAM for 4+", () => {
    expect(calcScope(4)).toBe("CROSS_TEAM");
    expect(calcScope(10)).toBe("CROSS_TEAM");
  });
});

describe("calcScopeByOrg", () => {
  it("uses org count when available", () => {
    expect(calcScopeByOrg(1, 5)).toBe("SINGLE");
    expect(calcScopeByOrg(2, 1)).toBe("CROSS_PERSON");
    expect(calcScopeByOrg(5, 1)).toBe("CROSS_TEAM");
  });

  it("falls back to person count when no orgs", () => {
    expect(calcScopeByOrg(0, 4)).toBe("CROSS_TEAM");
    expect(calcScopeByOrg(0, 2)).toBe("CROSS_PERSON");
    expect(calcScopeByOrg(0, 1)).toBe("SINGLE");
  });
});

describe("calcConfidence", () => {
  it("returns HIGH for 5+ tickets with specific entity", () => {
    expect(calcConfidence(5, true)).toBe("HIGH");
    expect(calcConfidence(10, true)).toBe("HIGH");
  });

  it("returns MEDIUM for 3-4 tickets", () => {
    expect(calcConfidence(3, false)).toBe("MEDIUM");
    expect(calcConfidence(4, true)).toBe("MEDIUM");
  });

  it("returns LOW for 2 tickets", () => {
    expect(calcConfidence(2, true)).toBe("LOW");
    expect(calcConfidence(2, false)).toBe("LOW");
  });
});
