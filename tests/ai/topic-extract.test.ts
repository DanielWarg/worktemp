import { describe, it, expect } from "vitest";
import { extractCorpusTopics, aggregateClusterTopics } from "../../lib/ai/topic-extract";

describe("extractCorpusTopics", () => {
  it("returns empty map for empty input", () => {
    expect(extractCorpusTopics([]).size).toBe(0);
  });

  it("extracts topics from ticket corpus", () => {
    // Need enough tickets so that TIMS (3/10 = 30%) stays under the 40% DF cutoff
    const tickets = [
      { id: "1", text: "TIMS fungerar inte på stationen", tags: ["Support"] },
      { id: "2", text: "TIMS kraschar vid inloggning", tags: ["Support"] },
      { id: "3", text: "TIMS visar fel information", tags: ["Support"] },
      { id: "4", text: "PubTrans ligger nere idag", tags: ["Drift"] },
      { id: "5", text: "PubTrans timeout vid sökning", tags: ["Drift"] },
      { id: "6", text: "Servern svarar inte på ping", tags: ["Infra"] },
      { id: "7", text: "Backup misslyckades i natt", tags: ["Infra"] },
      { id: "8", text: "Disk full på webbserver", tags: ["Infra"] },
      { id: "9", text: "Certifikat har gått ut", tags: ["Säkerhet"] },
      { id: "10", text: "VPN fungerar inte hemifrån", tags: ["Helpdesk"] },
    ];
    const result = extractCorpusTopics(tickets);
    expect(result.size).toBe(10);

    // TIMS should be a top topic for tickets 1-3
    const t1 = result.get("1")!;
    expect(t1.topics).toContain("TIMS");

    // PubTrans should be a top topic for tickets 4-5
    const t4 = result.get("4")!;
    expect(t4.topics).toContain("PubTrans");
  });

  it("filters stop words", () => {
    const tickets = [
      { id: "1", text: "Problem med att det inte fungerar", tags: [] },
      { id: "2", text: "Problem med att det inte fungerar igen", tags: [] },
      { id: "3", text: "Problem med att det inte startar", tags: [] },
    ];
    const result = extractCorpusTopics(tickets);
    const t1 = result.get("1")!;
    // "att", "det", "inte" are stop words and should not appear
    expect(t1.topics).not.toContain("att");
    expect(t1.topics).not.toContain("det");
    expect(t1.topics).not.toContain("inte");
  });

  it("boosts proper nouns (ALLCAPS, CamelCase)", () => {
    // TransitCloud in 3 of 10 tickets = 30% < 40% cutoff, so it passes DF filter
    const tickets = [
      { id: "1", text: "Spårningshistorik saknas i TransitCloud", tags: [] },
      { id: "2", text: "Data saknas i TransitCloud idag", tags: [] },
      { id: "3", text: "TransitCloud visar gamla saker", tags: [] },
      { id: "4", text: "Backup fungerar bra hela veckan", tags: [] },
      { id: "5", text: "Ny release ute igår kväll", tags: [] },
      { id: "6", text: "Certifikatet har gått ut", tags: [] },
      { id: "7", text: "VPN timeout från kontoret", tags: [] },
      { id: "8", text: "Skrivaren fastnar varje dag", tags: [] },
      { id: "9", text: "Outlook synkar inte kalendern", tags: [] },
      { id: "10", text: "Teams hackar under möten", tags: [] },
    ];
    const result = extractCorpusTopics(tickets);
    const t1 = result.get("1")!;
    // TransitCloud (CamelCase, 2x boost) should be in topics
    expect(t1.topics).toContain("TransitCloud");
  });
});

describe("aggregateClusterTopics", () => {
  it("aggregates topics across tickets", () => {
    const ticketTopics = new Map([
      ["1", { topics: ["TIMS", "inloggning", "fel"], signature: "TIMS|inloggning|fel" }],
      ["2", { topics: ["TIMS", "kraschar", "stationen"], signature: "TIMS|kraschar|stationen" }],
      ["3", { topics: ["TIMS", "fel", "uppdatering"], signature: "TIMS|fel|uppdatering" }],
    ]);
    const result = aggregateClusterTopics(ticketTopics, ["1", "2", "3"]);
    // TIMS appears in all 3 → highest score
    expect(result[0]).toBe("TIMS");
  });

  it("filters bigrams redundant with unigrams", () => {
    const ticketTopics = new Map([
      ["1", { topics: ["TIMS", "PubTrans", "pubtrans tims"], signature: "" }],
      ["2", { topics: ["TIMS", "PubTrans", "pubtrans tims"], signature: "" }],
    ]);
    const result = aggregateClusterTopics(ticketTopics, ["1", "2"]);
    // "pubtrans tims" should be filtered since both parts are unigrams
    expect(result).not.toContain("pubtrans tims");
  });

  it("returns empty for unknown ticket IDs", () => {
    const ticketTopics = new Map([
      ["1", { topics: ["TIMS"], signature: "TIMS" }],
    ]);
    const result = aggregateClusterTopics(ticketTopics, ["999"]);
    expect(result).toEqual([]);
  });
});
