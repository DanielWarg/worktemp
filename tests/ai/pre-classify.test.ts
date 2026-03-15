import { describe, it, expect } from "vitest";
import { classifyTicket, findDuplicates } from "../../lib/ai/pre-classify";

describe("classifyTicket", () => {
  it("marks monitoring alerts as noise", () => {
    expect(classifyTicket("[NR] HeartBeat failed").isNoise).toBe(true);
    expect(classifyTicket("SQLJob: backup failed").isNoise).toBe(true);
    expect(classifyTicket("DiskFreeSpace warning on srv01").isNoise).toBe(true);
    expect(classifyTicket("Service not running on PROD").isNoise).toBe(true);
  });

  it("marks admin as noise", () => {
    expect(classifyTicket("Möte med leverantör").isNoise).toBe(true);
    expect(classifyTicket("Utbildning Qlik").isNoise).toBe(true);
  });

  it("keeps forwarded emails as non-noise", () => {
    const r = classifyTicket("FW: TIMS problem i produktion");
    expect(r.isNoise).toBe(false);
    expect(r.ticketClass).toBe("forwarded_email");
  });

  it("keeps config changes as non-noise", () => {
    const r = classifyTicket("E22 infraändring: Zonjustering Kista");
    expect(r.isNoise).toBe(false);
    expect(r.ticketClass).toBe("config_change");
  });

  it("defaults to customer_incident", () => {
    const r = classifyTicket("Spårningshistorik saknas idag");
    expect(r.ticketClass).toBe("customer_incident");
    expect(r.isNoise).toBe(false);
  });
});

describe("findDuplicates", () => {
  it("marks duplicates from same person with same text", () => {
    const items = [
      { id: "1", text: "TIMS fungerar inte", person: "Anna" },
      { id: "2", text: "TIMS fungerar inte", person: "Anna" },
      { id: "3", text: "TIMS fungerar inte", person: "Anna" },
    ];
    const dupes = findDuplicates(items);
    expect(dupes.size).toBe(2); // keeps first, marks 2nd and 3rd
    expect(dupes.has("1")).toBe(false);
    expect(dupes.has("2")).toBe(true);
    expect(dupes.has("3")).toBe(true);
  });

  it("keeps same text from different persons", () => {
    const items = [
      { id: "1", text: "TIMS fungerar inte", person: "Anna" },
      { id: "2", text: "TIMS fungerar inte", person: "Erik" },
    ];
    const dupes = findDuplicates(items);
    expect(dupes.size).toBe(0);
  });

  it("scopes dedup to batchKey — cross-batch kept as recurring", () => {
    const items = [
      { id: "1", text: "TIMS fungerar inte", person: "Anna", batchKey: "session-1" },
      { id: "2", text: "TIMS fungerar inte", person: "Anna", batchKey: "session-2" },
    ];
    const dupes = findDuplicates(items);
    expect(dupes.size).toBe(0); // different sessions = recurring, not duplicate
  });

  it("deduplicates within same batch", () => {
    const items = [
      { id: "1", text: "TIMS fungerar inte", person: "Anna", batchKey: "session-1" },
      { id: "2", text: "TIMS fungerar inte", person: "Anna", batchKey: "session-1" },
    ];
    const dupes = findDuplicates(items);
    expect(dupes.size).toBe(1);
    expect(dupes.has("2")).toBe(true);
  });

  it("normalizes FW/RE prefixes", () => {
    const items = [
      { id: "1", text: "TIMS problem", person: "Anna" },
      { id: "2", text: "FW: TIMS problem", person: "Anna" },
    ];
    const dupes = findDuplicates(items);
    expect(dupes.size).toBe(1);
  });
});
