/**
 * AI Pipeline Eval — tests detect-patterns prompt against mock scenarios
 * with known expected outcomes, scores results, and iterates.
 *
 * Usage: npx tsx scripts/eval-pipeline.ts
 */

import { writeFileSync } from "fs";
import { config } from "dotenv";

config({ path: new URL("../.env.local", import.meta.url).pathname });
config({ path: new URL("../.env", import.meta.url).pathname });

const LOCAL_URL = process.env.LOCAL_LLM_URL || "http://127.0.0.1:8081";

// ── Mock scenarios with expected outcomes ────────────────────────────────

type Challenge = { id: string; person: string; tags: string[]; text: string };
type ExpectedPattern = {
  titleKeywords: string[]; // words that should appear in pattern title
  mustInclude: string[];   // challenge IDs that MUST be in this pattern
  mustExclude: string[];   // challenge IDs that must NOT be in this pattern
  expectedType: string;    // RECURRING | ESCALATING | CROSS_PERSON | CROSS_TEAM
};
type Scenario = {
  name: string;
  context: string;
  challenges: Challenge[];
  expected: ExpectedPattern[];
  expectedPatternCount: { min: number; max: number };
};

const SCENARIOS: Scenario[] = [
  {
    name: "Tydliga kluster — IT-support",
    context: "IT-supportärenden från ett medelstort företag",
    challenges: [
      { id: "c1", person: "Anna", tags: ["VPN"], text: "VPN kopplar ner sig flera gånger om dagen" },
      { id: "c2", person: "Erik", tags: ["VPN"], text: "VPN-anslutningen tappar kontakten efter 30 minuter" },
      { id: "c3", person: "Sara", tags: ["VPN"], text: "Kan inte ansluta till VPN hemifrån sedan uppdateringen" },
      { id: "c4", person: "Anna", tags: ["Skrivare"], text: "Skrivaren på plan 3 skriver ut blanka sidor" },
      { id: "c5", person: "Johan", tags: ["Skrivare"], text: "Kan inte skriva ut dubbelsidig sedan firmware-uppdateringen" },
      { id: "c6", person: "Lisa", tags: ["E-post"], text: "Outlook kraschar vid öppning av stora bilagor" },
      { id: "c7", person: "Erik", tags: ["E-post"], text: "E-post synkas inte mellan telefon och dator" },
      { id: "c8", person: "Sara", tags: ["E-post"], text: "Outlook hänger sig i 10 sekunder vid sökning" },
      { id: "c9", person: "Johan", tags: ["Nätverk"], text: "WiFi på kontoret är instabilt på eftermiddagarna" },
      { id: "c10", person: "Unrelated", tags: ["Övrigt"], text: "Behöver ny ergonomisk stol till kontoret" },
    ],
    expected: [
      { titleKeywords: ["VPN"], mustInclude: ["c1", "c2", "c3"], mustExclude: ["c4", "c10"], expectedType: "RECURRING" },
      { titleKeywords: ["skrivar", "print"], mustInclude: ["c4", "c5"], mustExclude: ["c1", "c10"], expectedType: "RECURRING" },
      { titleKeywords: ["outlook", "e-post", "mail"], mustInclude: ["c6", "c7", "c8"], mustExclude: ["c1", "c10"], expectedType: "RECURRING" },
    ],
    expectedPatternCount: { min: 3, max: 5 },
  },
  {
    name: "Cross-person — samma problem, olika personer",
    context: "Kundserviceärenden från en e-handelsplattform",
    challenges: [
      { id: "c1", person: "Team A - Maria", tags: ["Checkout"], text: "Kunder kan inte slutföra betalning med Swish sedan i torsdags" },
      { id: "c2", person: "Team A - Karin", tags: ["Checkout"], text: "Swish-betalningar misslyckas intermittent, ca 20% av försöken" },
      { id: "c3", person: "Team B - Ahmed", tags: ["Checkout"], text: "Betalning med Swish ger felkod 500 efter timeout" },
      { id: "c4", person: "Team A - Maria", tags: ["Sök"], text: "Produktsökningen returnerar irrelevanta resultat" },
      { id: "c5", person: "Team B - Ahmed", tags: ["Sök"], text: "Sökfunktionen visar produkter som är slutsålda högst upp" },
      { id: "c6", person: "Team C - Björn", tags: ["Leverans"], text: "Spårningslänkar från PostNord ger 404" },
    ],
    expected: [
      { titleKeywords: ["swish", "betalning"], mustInclude: ["c1", "c2", "c3"], mustExclude: ["c4", "c6"], expectedType: "CROSS_PERSON" },
      { titleKeywords: ["sök"], mustInclude: ["c4", "c5"], mustExclude: ["c1", "c6"], expectedType: "CROSS_PERSON" },
    ],
    expectedPatternCount: { min: 2, max: 4 },
  },
  {
    name: "Eskalerande — samma problem blir värre",
    context: "Driftärenden från en SaaS-plattform",
    challenges: [
      { id: "c1", person: "Ops", tags: ["DB"], text: "Databasquerys tar 2s istället för normala 200ms sedan förra veckan" },
      { id: "c2", person: "Ops", tags: ["DB"], text: "Databasen svarar inte alls under peak-timmar kl 10-12" },
      { id: "c3", person: "Ops", tags: ["DB"], text: "Kunder rapporterar timeouts — databasen har kraschat tre gånger denna vecka" },
      { id: "c4", person: "Dev", tags: ["Deploy"], text: "CI/CD-pipelinen tar 45 minuter istället för 15" },
      { id: "c5", person: "Dev", tags: ["Deploy"], text: "Deployments misslyckas intermittent pga minnesfel i CI" },
      { id: "c6", person: "Support", tags: ["API"], text: "API:et returnerar 503 för ca 5% av anropen" },
      { id: "c7", person: "Support", tags: ["API"], text: "API:et har haft tre totala nedstängningar denna månad" },
    ],
    expected: [
      { titleKeywords: ["databas", "db", "prestanda"], mustInclude: ["c1", "c2", "c3"], mustExclude: ["c4", "c6"], expectedType: "ESCALATING" },
      { titleKeywords: ["api", "tillgänglighet", "drift"], mustInclude: ["c6", "c7"], mustExclude: ["c1", "c4"], expectedType: "ESCALATING" },
    ],
    expectedPatternCount: { min: 2, max: 4 },
  },
  {
    name: "Brus — många orelaterade ärenden",
    context: "Blandade ärenden utan tydliga mönster",
    challenges: [
      { id: "c1", person: "A", tags: ["Misc"], text: "Lampan i mötesrum B3 är trasig" },
      { id: "c2", person: "B", tags: ["Misc"], text: "Kaffemaskinen på plan 2 behöver service" },
      { id: "c3", person: "C", tags: ["Misc"], text: "Parkeringsautomaten tar inte kort" },
      { id: "c4", person: "D", tags: ["IT"], text: "Behöver licens för Adobe Creative Suite" },
      { id: "c5", person: "E", tags: ["HR"], text: "Fråga om semesterregler för nyanställda" },
    ],
    expected: [], // should detect NO patterns — these are unrelated
    expectedPatternCount: { min: 0, max: 1 },
  },
  {
    name: "Cross-team — samma problem i olika team",
    context: "Kollektivtrafikföretag med flera operatörer",
    challenges: [
      { id: "c1", person: "Nobina-TL", tags: ["TIMS"], text: "TIMS visar felaktig position för bussar på linje 4" },
      { id: "c2", person: "Arriva-TL", tags: ["TIMS"], text: "TIMS-positioner stämmer inte med verkligheten för tåg" },
      { id: "c3", person: "Keolis-TL", tags: ["TIMS"], text: "Felaktiga GPS-koordinater i TIMS för spårvagnar" },
      { id: "c4", person: "Nobina-TL", tags: ["Schema"], text: "Schemasystemet synkar inte med tidtabell i TransitCloud" },
      { id: "c5", person: "Arriva-TL", tags: ["Schema"], text: "TransitCloud visar gamla tidtabeller trots uppdatering" },
      { id: "c6", person: "Keolis-TL", tags: ["Schema"], text: "Tidtabellsdata i Instant matchar inte TransitCloud" },
      { id: "c7", person: "Nobina-Förare", tags: ["Fordon"], text: "Förarplattan startar inte efter uppdatering" },
      { id: "c8", person: "Arriva-Förare", tags: ["Fordon"], text: "Förarplattan fryser under körning sedan senaste uppdateringen" },
    ],
    expected: [
      { titleKeywords: ["TIMS", "position", "GPS"], mustInclude: ["c1", "c2", "c3"], mustExclude: ["c4", "c7"], expectedType: "CROSS_TEAM" },
      { titleKeywords: ["schema", "tidtabell", "synk", "TransitCloud"], mustInclude: ["c4", "c5", "c6"], mustExclude: ["c1", "c7"], expectedType: "CROSS_TEAM" },
      { titleKeywords: ["förarplatt"], mustInclude: ["c7", "c8"], mustExclude: ["c1", "c4"], expectedType: "CROSS_TEAM" },
    ],
    expectedPatternCount: { min: 3, max: 5 },
  },
];

// ── Build the same prompt as local-detect-patterns.ts ──────────────────

function buildDetectPrompt(challenges: Challenge[], context: string): string {
  const challengeTexts = challenges
    .map((c, i) => `${i + 1}. [id:${c.id}] Person: ${c.person} | Taggar: ${c.tags.join(", ") || "inga"} | "${c.text}"`)
    .join("\n");

  const ctxPrefix = context ? `Kontext om datan: ${context}\n\n` : "";

  return `${ctxPrefix}Du analyserar utmaningar som fångats i teammöten. Identifiera mönster — problem som är återkommande, eskalerande, eller delas av flera personer/team.

REGLER:
- Kräv minst 2 challenges per mönster
- Varje challenge ska bara tillhöra ETT mönster (det mest relevanta)
- Skapa INTE dubbletter av befintliga mönster
- Var restriktiv — skapa bara mönster med tydlig tematisk koppling
- Om inga mönster finns, returnera tom array []

Befintliga mönster (skapa inte dubbletter): (inga)

Utmaningar:
${challengeTexts}

Returnera JSON-array (inga kommentarer i JSON):
[{
  "title": "Kort titel",
  "description": "Förklaring av mönstret",
  "patternType": "<välj exakt EN av: RECURRING, ESCALATING, CROSS_PERSON, CROSS_TEAM>",
  "challengeIds": ["id1", "id2"],
  "suggestion": "En konkret åtgärd"
}]`;
}

// ── Call local LLM ────────────────────────────────────────────────────

type DetectedPattern = {
  title: string;
  description: string;
  patternType: string;
  challengeIds: string[];
  suggestion: string;
};

async function callLLM(prompt: string): Promise<{ patterns: DetectedPattern[]; raw: string; durationMs: number; parseError?: string }> {
  const start = Date.now();
  const res = await fetch(`${LOCAL_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3000,
      temperature: 0.3,
      stream: false,
    }),
  });
  const data = await res.json();
  const durationMs = Date.now() - start;
  const raw = data.choices?.[0]?.message?.content ?? "";

  try {
    const match = raw.match(/\[[\s\S]*\]/);
    const cleaned = match ? match[0].replace(/\/\/[^\n]*/g, "") : null;
    const patterns: DetectedPattern[] = cleaned ? JSON.parse(cleaned) : [];
    return { patterns, raw, durationMs };
  } catch (e) {
    return { patterns: [], raw, durationMs, parseError: String(e) };
  }
}

// ── Scoring ──────────────────────────────────────────────────────────

type ScenarioScore = {
  name: string;
  durationMs: number;
  patternCount: number;
  parseError?: string;
  countScore: number;       // 0-1: is pattern count in expected range?
  coverageScore: number;    // 0-1: what % of expected patterns were found?
  precisionScore: number;   // 0-1: what % of detected patterns match expected?
  noStuffingScore: number;  // 0-1: no irrelevant challenges stuffed in?
  validTypeScore: number;   // 0-1: patternType values are valid?
  noDuplicateScore: number; // 0-1: no duplicate/overlapping patterns?
  total: number;            // weighted average
  details: string[];
};

const VALID_TYPES = new Set(["RECURRING", "ESCALATING", "CROSS_PERSON", "CROSS_TEAM"]);

function scoreScenario(scenario: Scenario, detected: DetectedPattern[]): ScenarioScore {
  const details: string[] = [];
  const validIds = new Set(scenario.challenges.map((c) => c.id));

  // 1. Count score
  const { min, max } = scenario.expectedPatternCount;
  const countOk = detected.length >= min && detected.length <= max;
  const countScore = countOk ? 1 : detected.length < min ? detected.length / min : max / detected.length;
  details.push(`Antal: ${detected.length} (förväntat ${min}-${max}) → ${(countScore * 100).toFixed(0)}%`);

  // 2. Coverage — how many expected patterns were matched?
  let coverageHits = 0;
  for (const exp of scenario.expected) {
    const matched = detected.some((d) => {
      const titleLower = d.title.toLowerCase();
      const hasKeyword = exp.titleKeywords.some((kw) => titleLower.includes(kw.toLowerCase()));
      const hasRequiredIds = exp.mustInclude.every((id) => d.challengeIds.includes(id));
      return hasKeyword || hasRequiredIds;
    });
    if (matched) coverageHits++;
    else details.push(`  MISS: förväntat mönster med nyckelord [${exp.titleKeywords.join(", ")}] hittades ej`);
  }
  const coverageScore = scenario.expected.length > 0 ? coverageHits / scenario.expected.length : 1;
  details.push(`Täckning: ${coverageHits}/${scenario.expected.length} förväntade mönster → ${(coverageScore * 100).toFixed(0)}%`);

  // 3. Precision — detected patterns that don't match anything expected
  let precisionHits = 0;
  for (const d of detected) {
    const matchesAny = scenario.expected.some((exp) => {
      const titleLower = d.title.toLowerCase();
      return exp.titleKeywords.some((kw) => titleLower.includes(kw.toLowerCase()));
    });
    if (matchesAny) precisionHits++;
    else details.push(`  EXTRA: "${d.title}" matchar inget förväntat mönster`);
  }
  const precisionScore = detected.length > 0 ? precisionHits / detected.length : (scenario.expected.length === 0 ? 1 : 0);
  details.push(`Precision: ${precisionHits}/${detected.length} mönster matchade → ${(precisionScore * 100).toFixed(0)}%`);

  // 4. No stuffing — challenges linked to wrong patterns
  let stuffCount = 0;
  let totalLinks = 0;
  for (const d of detected) {
    for (const id of d.challengeIds) {
      totalLinks++;
      if (!validIds.has(id)) {
        stuffCount++;
        details.push(`  HALLUCINATION: "${d.title}" refererar id "${id}" som inte existerar`);
      }
    }
    // Check mustExclude
    for (const exp of scenario.expected) {
      const titleLower = d.title.toLowerCase();
      if (exp.titleKeywords.some((kw) => titleLower.includes(kw.toLowerCase()))) {
        for (const excl of exp.mustExclude) {
          if (d.challengeIds.includes(excl)) {
            stuffCount++;
            details.push(`  STUFFING: "${d.title}" inkluderar irrelevant ${excl}`);
          }
        }
      }
    }
  }
  const noStuffingScore = totalLinks > 0 ? Math.max(0, 1 - stuffCount / totalLinks) : 1;
  details.push(`Stuffing: ${stuffCount} felkopplingar av ${totalLinks} → ${(noStuffingScore * 100).toFixed(0)}% korrekt`);

  // 5. Valid patternType
  let validTypes = 0;
  for (const d of detected) {
    if (VALID_TYPES.has(d.patternType)) {
      validTypes++;
    } else {
      details.push(`  OGILTIGT: patternType="${d.patternType}" (ska vara en av ${[...VALID_TYPES].join(", ")})`);
    }
  }
  const validTypeScore = detected.length > 0 ? validTypes / detected.length : 1;
  details.push(`Giltiga typer: ${validTypes}/${detected.length} → ${(validTypeScore * 100).toFixed(0)}%`);

  // 6. No duplicates — patterns with >50% overlapping challengeIds
  let duplicateCount = 0;
  for (let i = 0; i < detected.length; i++) {
    for (let j = i + 1; j < detected.length; j++) {
      const a = new Set(detected[i].challengeIds);
      const b = new Set(detected[j].challengeIds);
      const overlap = [...a].filter((id) => b.has(id)).length;
      const smaller = Math.min(a.size, b.size);
      if (smaller > 0 && overlap / smaller > 0.5) {
        duplicateCount++;
        details.push(`  DUBBLETT: "${detected[i].title}" ↔ "${detected[j].title}" (${overlap} gemensamma av ${smaller})`);
      }
    }
  }
  const noDuplicateScore = detected.length > 1 ? Math.max(0, 1 - duplicateCount / (detected.length - 1)) : 1;
  details.push(`Dubbletter: ${duplicateCount} par → ${(noDuplicateScore * 100).toFixed(0)}% unikt`);

  // Weighted total
  const total =
    countScore * 0.1 +
    coverageScore * 0.25 +
    precisionScore * 0.2 +
    noStuffingScore * 0.2 +
    validTypeScore * 0.15 +
    noDuplicateScore * 0.1;

  return {
    name: scenario.name,
    durationMs: 0,
    patternCount: detected.length,
    countScore,
    coverageScore,
    precisionScore,
    noStuffingScore,
    validTypeScore,
    noDuplicateScore,
    total,
    details,
  };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  AI Pipeline Eval — Ministral Pattern Detection             ║");
  console.log(`║  ${SCENARIOS.length} scenarier · ${new Date().toISOString().slice(0, 16)}                      ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const results: ScenarioScore[] = [];

  for (const scenario of SCENARIOS) {
    process.stdout.write(`▸ ${scenario.name}... `);
    const prompt = buildDetectPrompt(scenario.challenges, scenario.context);
    const { patterns, durationMs, parseError } = await callLLM(prompt);

    const score = scoreScenario(scenario, patterns);
    score.durationMs = durationMs;
    score.parseError = parseError;
    results.push(score);

    const emoji = score.total >= 0.8 ? "✓" : score.total >= 0.5 ? "~" : "✗";
    console.log(`${emoji} ${(score.total * 100).toFixed(0)}% (${(durationMs / 1000).toFixed(1)}s, ${patterns.length} mönster)`);
  }

  // Summary
  console.log("\n" + "═".repeat(62));
  console.log("RESULTAT PER SCENARIO");
  console.log("═".repeat(62));

  for (const r of results) {
    console.log(`\n▸ ${r.name} — ${(r.total * 100).toFixed(0)}% (${r.patternCount} mönster, ${(r.durationMs / 1000).toFixed(1)}s)`);
    if (r.parseError) console.log(`  ⚠ Parse-fel: ${r.parseError}`);
    console.log(`  Antal=${(r.countScore*100).toFixed(0)} Täckning=${(r.coverageScore*100).toFixed(0)} Precision=${(r.precisionScore*100).toFixed(0)} Stuffing=${(r.noStuffingScore*100).toFixed(0)} Typer=${(r.validTypeScore*100).toFixed(0)} Dubbletter=${(r.noDuplicateScore*100).toFixed(0)}`);
    for (const d of r.details.filter((d) => d.startsWith("  "))) {
      console.log(d);
    }
  }

  const avg = results.reduce((sum, r) => sum + r.total, 0) / results.length;
  console.log("\n" + "═".repeat(62));
  console.log(`TOTALPOÄNG: ${(avg * 100).toFixed(0)}%`);
  console.log("═".repeat(62));

  // Save results
  const outPath = "/Users/evil/Desktop/EVIL/PROJEKT/worktemp/eval-pipeline-results.json";
  writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), averageScore: avg, scenarios: results }, null, 2));
  console.log(`\nSparad: ${outPath}`);
}

main().catch(console.error);
