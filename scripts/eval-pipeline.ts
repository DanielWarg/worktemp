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
  {
    name: "Stora batchar — 20 ärenden, 4 kluster",
    context: "Sjukvårds-IT med journalsystem och medicinteknisk utrustning",
    challenges: [
      // Kluster 1: Journalsystem (5 st)
      { id: "c1", person: "Sjuksköterska A", tags: ["Journal"], text: "Journalsystemet loggar ut mig var 5:e minut" },
      { id: "c2", person: "Läkare B", tags: ["Journal"], text: "Kan inte spara journalanteckningar — timeout efter 30 sekunder" },
      { id: "c3", person: "Sjuksköterska C", tags: ["Journal"], text: "Journalen visar fel patients data efter byte av flik" },
      { id: "c4", person: "Läkare D", tags: ["Journal"], text: "Sökfunktionen i journalsystemet hittar inte gamla anteckningar" },
      { id: "c5", person: "Sjuksköterska A", tags: ["Journal"], text: "Journalsystemet kraschar vid utskrift av sammanfattning" },
      // Kluster 2: Labbutrustning (4 st)
      { id: "c6", person: "Labbtek E", tags: ["Labb"], text: "Blodprovsanalysatorn ger felkod E-47 och stannar" },
      { id: "c7", person: "Labbtek F", tags: ["Labb"], text: "Analysresultat överförs inte automatiskt till journalsystemet" },
      { id: "c8", person: "Labbtek E", tags: ["Labb"], text: "Centrifugen vibrerar onormalt vid höga varvtal" },
      { id: "c9", person: "Labbtek G", tags: ["Labb"], text: "Provrörsscannern läser inte streckkoder korrekt" },
      // Kluster 3: Schemaläggning (4 st)
      { id: "c10", person: "Chef H", tags: ["Schema"], text: "Schemasystemet räknar fel på övertid" },
      { id: "c11", person: "Chef I", tags: ["Schema"], text: "Kan inte boka in vikarier via schemasystemet — knappen gråad" },
      { id: "c12", person: "Sjuksköterska A", tags: ["Schema"], text: "Mitt schema visas inte för nästa vecka trots att det är publicerat" },
      { id: "c13", person: "Läkare B", tags: ["Schema"], text: "Semesteransökan försvann ur schemasystemet efter godkännande" },
      // Kluster 4: Nätverksinfrastruktur (3 st)
      { id: "c14", person: "IT-support", tags: ["Nätverk"], text: "WiFi på avdelning 4B tappar anslutning varje förmiddag" },
      { id: "c15", person: "IT-support", tags: ["Nätverk"], text: "VPN till hemarbete fungerar inte sedan routerbytet" },
      { id: "c16", person: "Sjuksköterska C", tags: ["Nätverk"], text: "Surfplattorna på ronden förlorar nätverket i hiss och källare" },
      // Brus (4 st — ska INTE bilda mönster)
      { id: "c17", person: "Vaktmästare", tags: ["Övrigt"], text: "Kaffemaskinen på plan 2 läcker" },
      { id: "c18", person: "Chef H", tags: ["Övrigt"], text: "Behöver beställa nya ID-brickor till sommarvikarier" },
      { id: "c19", person: "Läkare D", tags: ["Övrigt"], text: "Projektorn i konferensrummet har dålig upplösning" },
      { id: "c20", person: "Sjuksköterska C", tags: ["Övrigt"], text: "Önskar ergonomiska stolar till nattsköterskorna" },
    ],
    expected: [
      { titleKeywords: ["journal"], mustInclude: ["c1", "c2", "c3"], mustExclude: ["c6", "c10", "c17"], expectedType: "RECURRING" },
      { titleKeywords: ["labb", "analys", "utrustning"], mustInclude: ["c6", "c7"], mustExclude: ["c1", "c10", "c17"], expectedType: "RECURRING" },
      { titleKeywords: ["schema"], mustInclude: ["c10", "c11"], mustExclude: ["c1", "c6", "c17"], expectedType: "RECURRING" },
      { titleKeywords: ["nätverk", "wifi", "anslutning"], mustInclude: ["c14", "c15"], mustExclude: ["c1", "c6", "c17"], expectedType: "RECURRING" },
    ],
    expectedPatternCount: { min: 3, max: 6 },
  },
  {
    name: "Vaga beskrivningar — svår att tolka",
    context: "Interna förbättringsförslag från ett konsultbolag",
    challenges: [
      { id: "c1", person: "Konsult A", tags: ["Process"], text: "Det tar för lång tid" },
      { id: "c2", person: "Konsult B", tags: ["Process"], text: "Processen är omständlig och krånglig" },
      { id: "c3", person: "Konsult C", tags: ["Process"], text: "Vi gör samma sak flera gånger i onödan" },
      { id: "c4", person: "Konsult A", tags: ["Verktyg"], text: "Systemet fungerar dåligt" },
      { id: "c5", person: "Konsult D", tags: ["Verktyg"], text: "Verktygen vi använder är föråldrade" },
      { id: "c6", person: "Konsult B", tags: ["Kultur"], text: "Vi pratar aldrig om problemen" },
    ],
    expected: [
      { titleKeywords: ["process", "tid", "ineffektiv"], mustInclude: ["c1", "c2", "c3"], mustExclude: ["c4", "c6"], expectedType: "RECURRING" },
      { titleKeywords: ["verktyg", "system"], mustInclude: ["c4", "c5"], mustExclude: ["c1", "c6"], expectedType: "RECURRING" },
    ],
    expectedPatternCount: { min: 1, max: 3 },
  },
  {
    name: "Samma person, samma problem — inte cross-person",
    context: "Buggrapporter från en ensam testare",
    challenges: [
      { id: "c1", person: "Testare Kim", tags: ["Login"], text: "Login-sidan ger 500-fel vid specialtecken i lösenord" },
      { id: "c2", person: "Testare Kim", tags: ["Login"], text: "Inloggning med SSO redirectar till fel sida" },
      { id: "c3", person: "Testare Kim", tags: ["Login"], text: "Glömt lösenord-flödet skickar ingen mejl" },
      { id: "c4", person: "Testare Kim", tags: ["Checkout"], text: "Varukorgen försvinner efter siduppdatering" },
      { id: "c5", person: "Testare Kim", tags: ["Checkout"], text: "Rabattkod appliceras inte på redan nedsatta varor" },
    ],
    expected: [
      { titleKeywords: ["login", "inloggning", "autentisering"], mustInclude: ["c1", "c2", "c3"], mustExclude: ["c4"], expectedType: "RECURRING" },
      { titleKeywords: ["checkout", "varukorg", "kassa"], mustInclude: ["c4", "c5"], mustExclude: ["c1"], expectedType: "RECURRING" },
    ],
    expectedPatternCount: { min: 2, max: 3 },
  },
  {
    name: "Flerspråkig input — svenska och engelska blandat",
    context: "Internationellt utvecklingsteam med svensk och engelsk kommunikation",
    challenges: [
      { id: "c1", person: "Dev SE", tags: ["Deploy"], text: "Deploy-pipelinen failar på staging med exit code 137 (OOM)" },
      { id: "c2", person: "Dev EN", tags: ["Deploy"], text: "Deployment keeps timing out on staging environment" },
      { id: "c3", person: "Dev SE", tags: ["Deploy"], text: "Kan inte deploya till staging — bygget kraschar efter 20 min" },
      { id: "c4", person: "Dev EN", tags: ["Testing"], text: "Flaky tests in CI — intermittent failures on database tests" },
      { id: "c5", person: "Dev SE", tags: ["Testing"], text: "Instabila tester som ibland failar pga race conditions" },
      { id: "c6", person: "Dev EN", tags: ["Testing"], text: "Test suite takes 45 minutes, blocking PRs" },
    ],
    expected: [
      { titleKeywords: ["deploy", "staging", "pipeline"], mustInclude: ["c1", "c2", "c3"], mustExclude: ["c4"], expectedType: "RECURRING" },
      { titleKeywords: ["test", "CI", "instabil", "flaky"], mustInclude: ["c4", "c5"], mustExclude: ["c1"], expectedType: "RECURRING" },
    ],
    expectedPatternCount: { min: 2, max: 3 },
  },
  {
    name: "Överlappande teman — ska INTE skapa dubbletter",
    context: "E-handelsplattform med betalnings- och orderproblem",
    challenges: [
      { id: "c1", person: "Support A", tags: ["Betalning"], text: "Klarna-betalningar misslyckas med felkod 409" },
      { id: "c2", person: "Support B", tags: ["Betalning"], text: "Kunder får dubbeldebiteringar vid Klarna-checkout" },
      { id: "c3", person: "Support A", tags: ["Betalning"], text: "Klarna faktura skapas men ordern registreras inte" },
      { id: "c4", person: "Support C", tags: ["Order"], text: "Order skapas utan orderbekräftelse-mejl" },
      { id: "c5", person: "Support B", tags: ["Order"], text: "Orderstatus fastnar på 'Behandlas' trots levererad vara" },
      { id: "c6", person: "Support A", tags: ["Order"], text: "Returer syns inte i ordersystemet — måste läggas in manuellt" },
    ],
    expected: [
      { titleKeywords: ["klarna", "betalning"], mustInclude: ["c1", "c2", "c3"], mustExclude: ["c4", "c5"], expectedType: "RECURRING" },
      { titleKeywords: ["order"], mustInclude: ["c4", "c5", "c6"], mustExclude: ["c1", "c2"], expectedType: "RECURRING" },
    ],
    expectedPatternCount: { min: 2, max: 3 },
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

// ── Call LLM (supports llama.cpp and Ollama) ─────────────────────────

type DetectedPattern = {
  title: string;
  description: string;
  patternType: string;
  challengeIds: string[];
  suggestion: string;
};

type LLMBackend = {
  name: string;
  url: string;
  model?: string; // required for Ollama
};

const BACKENDS: LLMBackend[] = [
  { name: "Ministral 14B (llama.cpp)", url: LOCAL_URL },
  { name: "Qwen 3.5 9B (Ollama)", url: "http://localhost:11434", model: "qwen3.5:9b" },
];

async function callLLM(prompt: string, backend: LLMBackend): Promise<{ patterns: DetectedPattern[]; raw: string; durationMs: number; parseError?: string }> {
  const start = Date.now();

  let raw = "";
  if (backend.model) {
    // Ollama API
    const res = await fetch(`${backend.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: backend.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature: 0.3, num_predict: 3000 },
      }),
    });
    const data = await res.json();
    raw = data.message?.content ?? "";
  } else {
    // llama.cpp OpenAI-compatible API
    const res = await fetch(`${backend.url}/v1/chat/completions`, {
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
    raw = data.choices?.[0]?.message?.content ?? "";
  }

  const durationMs = Date.now() - start;

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
  // Check which backends are available
  const available: LLMBackend[] = [];
  for (const b of BACKENDS) {
    try {
      const url = b.model ? `${b.url}/api/tags` : `${b.url}/health`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) available.push(b);
      else console.log(`⚠ ${b.name}: ej tillgänglig`);
    } catch { console.log(`⚠ ${b.name}: ej tillgänglig`); }
  }

  if (available.length === 0) { console.log("Inga backends tillgängliga!"); return; }

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  AI Pipeline Eval — Model Comparison                        ║");
  console.log(`║  ${SCENARIOS.length} scenarier · ${available.length} modeller · ${new Date().toISOString().slice(0, 16)}        ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const allResults: Record<string, ScenarioScore[]> = {};

  for (const backend of available) {
    console.log(`\n▶ ${backend.name}`);
    console.log("─".repeat(62));
    allResults[backend.name] = [];

    for (const scenario of SCENARIOS) {
      process.stdout.write(`  ${scenario.name}... `);
      const prompt = buildDetectPrompt(scenario.challenges, scenario.context);
      const { patterns, durationMs, parseError } = await callLLM(prompt, backend);

      const score = scoreScenario(scenario, patterns);
      score.durationMs = durationMs;
      score.parseError = parseError;
      allResults[backend.name].push(score);

      const emoji = score.total >= 0.8 ? "✓" : score.total >= 0.5 ? "~" : "✗";
      console.log(`${emoji} ${(score.total * 100).toFixed(0)}% (${(durationMs / 1000).toFixed(1)}s, ${patterns.length} mönster)`);
    }
  }

  // Comparison table
  console.log("\n" + "═".repeat(62));
  console.log("JÄMFÖRELSE");
  console.log("═".repeat(62));

  // Header
  const modelNames = Object.keys(allResults);
  console.log(`\n${"Scenario".padEnd(40)} ${modelNames.map((n) => n.slice(0, 18).padStart(18)).join(" ")}`);
  console.log("─".repeat(40 + modelNames.length * 19));

  for (let i = 0; i < SCENARIOS.length; i++) {
    const name = SCENARIOS[i].name.slice(0, 38).padEnd(40);
    const scores = modelNames.map((m) => {
      const s = allResults[m][i];
      return `${(s.total * 100).toFixed(0)}% (${(s.durationMs / 1000).toFixed(0)}s)`.padStart(18);
    }).join(" ");
    console.log(`${name}${scores}`);
  }

  console.log("─".repeat(40 + modelNames.length * 19));
  const avgs = modelNames.map((m) => {
    const avg = allResults[m].reduce((sum, r) => sum + r.total, 0) / allResults[m].length;
    const totalTime = allResults[m].reduce((sum, r) => sum + r.durationMs, 0);
    return `${(avg * 100).toFixed(0)}% (${(totalTime / 1000).toFixed(0)}s)`.padStart(18);
  }).join(" ");
  console.log(`${"TOTALT".padEnd(40)}${avgs}`);

  // Per-metric comparison
  console.log("\n" + "═".repeat(62));
  console.log("PER METRIC (medel)");
  console.log("═".repeat(62));
  const metrics = ["countScore", "coverageScore", "precisionScore", "noStuffingScore", "validTypeScore", "noDuplicateScore"] as const;
  const metricLabels: Record<string, string> = { countScore: "Antal", coverageScore: "Täckning", precisionScore: "Precision", noStuffingScore: "Stuffing", validTypeScore: "Typer", noDuplicateScore: "Dubbletter" };

  console.log(`${"Metric".padEnd(20)} ${modelNames.map((n) => n.slice(0, 18).padStart(18)).join(" ")}`);
  for (const m of metrics) {
    const vals = modelNames.map((name) => {
      const avg = allResults[name].reduce((sum, r) => sum + r[m], 0) / allResults[name].length;
      return `${(avg * 100).toFixed(0)}%`.padStart(18);
    }).join(" ");
    console.log(`${(metricLabels[m] || m).padEnd(20)}${vals}`);
  }

  // Detailed failures per model
  for (const modelName of modelNames) {
    const failures = allResults[modelName].filter((r) => r.details.some((d) => d.startsWith("  ")));
    if (failures.length > 0) {
      console.log(`\n▸ ${modelName} — problem:`);
      for (const r of failures) {
        for (const d of r.details.filter((d) => d.startsWith("  "))) {
          console.log(`  [${r.name.slice(0, 25)}] ${d.trim()}`);
        }
      }
    }
  }

  // Save
  const outPath = `${process.cwd()}/eval-pipeline-results.json`;
  writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), models: allResults }, null, 2));
  console.log(`\nSparad: ${outPath}`);
}

main().catch(console.error);
