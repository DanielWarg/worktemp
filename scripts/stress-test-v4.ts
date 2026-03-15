/**
 * Stress test for v4 pipeline with synthetic data.
 *
 * Tests domain-agnosticism, volume scaling, and edge cases.
 *
 * Usage:
 *   npx tsx scripts/stress-test-v4.ts              # All scenarios
 *   npx tsx scripts/stress-test-v4.ts --scenario hr # Single scenario
 */

import { embedChallenges, type ChallengeForEmbed } from "../lib/ai/embed-challenges";
import { clusterChallenges } from "../lib/ai/cluster-challenges";
import { classifyTicket, findDuplicates } from "../lib/ai/pre-classify";
import { extractCorpusTopics, aggregateClusterTopics } from "../lib/ai/topic-extract";
import { deduplicatePatterns } from "../lib/ai/pattern-dedup";
import { calcTrend, calcScopeByOrg, calcConfidence } from "../lib/ai/trend-calc";

// ─── Mock data generators ───

type MockTicket = {
  id: string;
  text: string;
  person: string;
  org: string;
  tags: string[];
  date: Date;
};

function generateHRData(count: number): MockTicket[] {
  const problems = [
    // Onboarding cluster (~20%)
    { texts: [
      "Ny medarbetare fick aldrig inloggning till lönesystemet",
      "Onboarding-checklistan saknar IT-utrustning",
      "Mentor utsågs inte förrän vecka 3",
      "Introduktionsdagen var kaotisk, ingen agenda",
      "Nyanställd saknar behörighet till intranätet",
      "Första veckan utan arbetsplats — kontorsplatsen var inte bokad",
      "Anställningsavtalet kom 2 veckor för sent",
      "IT-utrustning levererades inte på startdagen",
    ], tags: ["Onboarding", "Ny medarbetare"], orgs: ["Sälj", "Marknad", "IT", "HR"] },
    // Sjukfrånvaro cluster (~15%)
    { texts: [
      "Upprepade korttidsfrånvaron, 5 tillfällen senaste kvartalet",
      "Sjukfrånvaro ökar kraftigt i kundtjänst",
      "Medarbetare rapporterar stress som orsak till sjukskrivning",
      "Rehab-plan saknas trots 3 månaders sjukskrivning",
      "Korttidsfrånvaro fredag/måndag — mönster hos 4 personer",
      "Sjukanmälan görs inte enligt rutin — chef informeras för sent",
    ], tags: ["Sjukfrånvaro", "Hälsa"], orgs: ["Kundtjänst", "Lager", "Produktion"] },
    // Lön/förmåner cluster (~15%)
    { texts: [
      "Löneutbetalning försenad med 2 dagar",
      "Friskvårdsbidrag syns inte på lönespecen",
      "Semesterdagar beräknas fel efter föräldraledighet",
      "Övertidsersättning utbetalas inte korrekt",
      "Lönerevision genomförd men nya löner inte uppdaterade",
      "Pensionsavsättning stämmer inte med avtal",
    ], tags: ["Lön", "Förmåner"], orgs: ["Alla avdelningar", "Ekonomi", "HR"] },
    // Arbetsmiljö cluster (~15%)
    { texts: [
      "Ventilationen fungerar inte på plan 3",
      "Belysningen i konferensrum B flimrar",
      "Ergonomisk arbetsplats saknas — ont i ryggen",
      "Buller från bygget störar koncentrationen",
      "Temperaturen är för hög på sommaren, ingen AC",
      "Skyddsrond visade brister i utrymningsvägar",
    ], tags: ["Arbetsmiljö", "Kontor"], orgs: ["Kontor Stockholm", "Kontor Göteborg", "Lager"] },
    // Kompetensutveckling cluster (~10%)
    { texts: [
      "Utbildningsbudget använd redan i Q1",
      "Kursanmälan nekas utan motivering",
      "Intern utbildning avbokad för tredje gången",
      "Kompetenskartläggning saknas helt",
      "Medarbetarsamtal genomförs inte enligt plan",
    ], tags: ["Utbildning", "Utveckling"], orgs: ["IT", "Sälj", "Produktion"] },
    // Diverse/noise
    { texts: [
      "Kaffemaskinen är trasig igen",
      "Parkeringsplatser räcker inte till",
      "Julbordet — allergier hanterades inte",
      "Fråga om policy för distansarbete",
    ], tags: ["Övrigt"], orgs: ["Alla avdelningar"] },
  ];

  return generateFromTemplates(problems, count, "hr");
}

function generatePhoneStatsData(count: number): MockTicket[] {
  const problems = [
    // Väntetider cluster
    { texts: [
      "Genomsnittlig väntetid överstiger 5 minuter",
      "Kunder lägger på efter 3 minuter i kö",
      "Väntetid på morgonen (08-09) är 12 minuter",
      "SLA-brott: 40% av samtal besvaras efter 120 sekunder",
      "Callback-funktionen fungerar inte — kunder väntar ändå",
      "Väntetid lunchrusning: 8 minuter snitt",
    ], tags: ["Väntetid", "SLA"], orgs: ["Kundcenter Nord", "Kundcenter Syd"] },
    // Bemanning cluster
    { texts: [
      "Underbemanning måndag förmiddag — 3 av 8 på plats",
      "Schemaläggning tar inte hänsyn till sjukfrånvaro",
      "Vikarier saknar systemutbildning",
      "Bemanningen matchar inte samtalsvolym",
      "Tre medarbetare slutade samma månad",
      "Övertid 40 timmar förra veckan — ohållbart",
    ], tags: ["Bemanning", "Schema"], orgs: ["Kundcenter Nord", "Kundcenter Syd", "Backoffice"] },
    // Systemfel cluster
    { texts: [
      "Telefonisystemet kraschade kl 10:30 — 45 min nere",
      "Automatisk samtalsfördelning (ACD) fördelar ojämnt",
      "IVR-menyn har fel öppettider inspelat",
      "Samtalslogg visar inte kundens historik",
      "Integration mot CRM tappar data vid överföring",
      "Headsets laddar ur efter 2 timmar — nya behövs",
    ], tags: ["System", "Teknik"], orgs: ["Kundcenter Nord", "IT-support"] },
    // Kundklagomål cluster
    { texts: [
      "Kund klagade på att bli kopplad 4 gånger",
      "Felinformation given av agent — kund fakturerad dubbelt",
      "Kund nekades återbetalning trots policy",
      "Språkbarriär — ingen fransktalande agent tillgänglig",
      "Kund eskalerade till chef — löstes inte på 2 veckor",
    ], tags: ["Kundklagomål", "Eskalering"], orgs: ["Kundcenter Syd", "Reklamation"] },
    // Utbildning cluster
    { texts: [
      "Nya agenter saknar produktutbildning",
      "Kunskapsbasen är inaktuell — fel svar ges",
      "Coachning sker bara varannan månad istället för varje vecka",
      "Samtalskvalitet försämras — CSAT ner 15%",
    ], tags: ["Utbildning", "Kvalitet"], orgs: ["Kundcenter Nord", "Kundcenter Syd"] },
  ];

  return generateFromTemplates(problems, count, "phone");
}

function generateMeetingNotesData(count: number): MockTicket[] {
  const problems = [
    // Deadline-stress cluster
    { texts: [
      "Projektet försenat 3 veckor — resursbrist",
      "Sprint review: 4 av 7 stories inte klara",
      "Deadline Q2-release hotad — backend inte klar",
      "Leverans försenas pga extern dependency",
      "Kunden accepterar inte ny tidplan — eskalering",
      "Testfasen krymps från 3 veckor till 1 — kvalitetsrisk",
    ], tags: ["Projekt", "Deadline"], orgs: ["Team Alpha", "Team Beta", "Team Gamma"] },
    // Kommunikation cluster
    { texts: [
      "Ingen visste att API:et ändrats — bröt integrationen",
      "Beslut togs utan att informera berörda team",
      "Retrospektiv avslöjar: sälj lovar features vi inte planerat",
      "Dokumentation saknas för nya microservicen",
      "Standup tar 45 minuter — fokus tappas",
      "Designern och utvecklarna har olika bild av kravet",
    ], tags: ["Kommunikation", "Process"], orgs: ["Team Alpha", "Team Beta", "Design"] },
    // Teknisk skuld cluster
    { texts: [
      "Deploy tog 4 timmar — pipeline instabil",
      "Samma bugg tredje gången — rootcause inte fixad",
      "Databas-migrering blockerade alla andra deploys",
      "Testmiljön nere 2 dagar — ingen prioritering",
      "Kodgranskning tar 5 dagar — flaskhals",
    ], tags: ["Tech debt", "Infrastruktur"], orgs: ["Platform", "Team Alpha"] },
    // Teamdynamik cluster
    { texts: [
      "Konflikter i teamet — pair programming fungerar inte",
      "Ny teammedlem inte inkluderad i beslut",
      "Senior dev monopoliserar arkitekturbeslut",
      "Jourtjänst ojämnt fördelad — 3 av 8 tar all jour",
      "Teamet uttrycker frustration över ändrade prioriteringar",
    ], tags: ["Team", "Kultur"], orgs: ["Team Alpha", "Team Beta", "Team Gamma"] },
  ];

  return generateFromTemplates(problems, count, "meeting");
}

function generateLargeITData(count: number): MockTicket[] {
  const problems = [
    { texts: [
      "Server CPU 98% — webbappen svarar inte",
      "SSL-certifikat utgånget på api.example.com",
      "Load balancer skickar trafik till nedtagen nod",
      "Backup misslyckades 3 nätter i rad",
      "DNS-propagering tog 48 timmar — kunder påverkade",
      "Kubernetes pod crashloops — OOM efter deploy",
    ], tags: ["Infrastruktur", "Drift"], orgs: ["Drift", "DevOps", "Kundtjänst"] },
    { texts: [
      "Outlook synkar inte kalendern",
      "VPN-anslutning timeout för hemmajobbande",
      "Skrivaren på plan 2 fastnar konstant",
      "Teams-möte — ljud hackar för alla deltagare",
      "Lösenord låst efter 3 felförsök — self-service fungerar inte",
      "Ny laptop — profil migrerades inte korrekt",
    ], tags: ["Helpdesk", "Användare"], orgs: ["Ekonomi", "HR", "Sälj", "Marknad"] },
    { texts: [
      "Jira går trögt — sidor tar 15 sekunder att ladda",
      "Confluence wiki visar gamla sidor istället för uppdaterade",
      "GitHub Actions — builds tar 25 minuter, var 8 för en månad sedan",
      "Slack-integrationen med Jira slutade fungera",
      "SonarQube blockerar merges pga false positive",
    ], tags: ["DevTools", "CI/CD"], orgs: ["Utveckling", "Platform"] },
    { texts: [
      "GDPR-förfrågan — radering inte genomförd inom 30 dagar",
      "Loggning saknas för admin-åtgärder",
      "Penetrationstest hittade XSS-sårbarhet",
      "Åtkomstkontroll — ex-anställd hade fortfarande VPN-access",
      "Incidentrapport saknas för senaste driftstörning",
    ], tags: ["Säkerhet", "Compliance"], orgs: ["IT-säkerhet", "Juridik", "Drift"] },
  ];

  return generateFromTemplates(problems, count, "it");
}

// ─── Helpers ───

function generateFromTemplates(
  clusters: { texts: string[]; tags: string[]; orgs: string[] }[],
  count: number,
  prefix: string,
): MockTicket[] {
  const tickets: MockTicket[] = [];
  const persons = [
    "Anna Svensson", "Erik Lindström", "Maria Johansson", "Karl Andersson",
    "Sara Nilsson", "Johan Pettersson", "Lisa Karlsson", "Anders Eriksson",
    "Emma Larsson", "Mikael Olsson", "Klara Berg", "Fredrik Holm",
  ];

  for (let i = 0; i < count; i++) {
    const cluster = clusters[i % clusters.length];
    const textIdx = i % cluster.texts.length;
    // Add slight variation to avoid exact dedup
    const variation = i >= cluster.texts.length ? ` (${Math.floor(i / cluster.texts.length) + 1})` : "";
    const person = persons[i % persons.length];
    const org = cluster.orgs[i % cluster.orgs.length];
    const daysAgo = Math.floor(Math.random() * 60);

    tickets.push({
      id: `${prefix}-${i + 1}`,
      text: cluster.texts[textIdx] + variation,
      person,
      org,
      tags: cluster.tags,
      date: new Date(Date.now() - daysAgo * 86400000),
    });
  }

  return tickets;
}

// ─── Pipeline runner ───

type PatternResult = {
  title: string;
  ticketIds: string[];
  topics: string[];
  scope: string;
  trend: string;
  confidence: string;
};

async function runV4Pipeline(tickets: MockTicket[]): Promise<{
  patterns: PatternResult[];
  metrics: {
    total: number;
    core: number;
    noiseFiltered: number;
    patternCount: number;
    coverage: number;
    orphanRate: number;
    maxSize: number;
    avgSize: number;
    dedupMerged: number;
    embedMs: number;
    totalMs: number;
    catchAll: number;
  };
}> {
  const t0 = Date.now();

  // Step 1: Filter
  const classifications = new Map<string, { isNoise: boolean }>();
  for (const t of tickets) classifications.set(t.id, classifyTicket(t.text, t.tags));
  const duplicateIds = findDuplicates(tickets.map((t) => ({ id: t.id, text: t.text, person: t.person })));
  for (const id of duplicateIds) classifications.set(id, { isNoise: true });
  const core = tickets.filter((t) => !classifications.get(t.id)?.isNoise);

  if (core.length < 3) return { patterns: [], metrics: { total: tickets.length, core: core.length, noiseFiltered: tickets.length - core.length, patternCount: 0, coverage: 0, orphanRate: 100, maxSize: 0, avgSize: 0, dedupMerged: 0, embedMs: 0, totalMs: Date.now() - t0, catchAll: 0 } };

  // Step 2: Embed
  const embedStart = Date.now();
  const forEmbed: ChallengeForEmbed[] = core.map((t) => ({ id: t.id, text: t.text, tags: t.tags }));
  const embeddings = await embedChallenges(forEmbed);
  const embedMs = Date.now() - embedStart;

  // Step 3: Cluster
  const clusterItems = core.map((t) => ({ id: t.id }));
  const clusters = clusterChallenges(clusterItems, embeddings);

  // Step 4: Topics
  const corpusInput = core.map((t) => ({ id: t.id, text: t.text, tags: t.tags }));
  const ticketTopics = extractCorpusTopics(corpusInput);
  const meaningfulGroups = clusters.filter((g) => g.length >= 2);

  // Step 5: Dedup
  type PrePattern = { ticketIds: string[]; topics: string[] };
  let prePatterns: PrePattern[] = meaningfulGroups.map((group) => {
    const ids = group.map((item) => item.id);
    return { ticketIds: ids, topics: aggregateClusterTopics(ticketTopics, ids) };
  });
  const beforeDedup = prePatterns.length;
  prePatterns = deduplicatePatterns(prePatterns, embeddings);
  const dedupMerged = beforeDedup - prePatterns.length;

  // Step 6: Metadata
  const patterns: PatternResult[] = prePatterns.map((pp) => {
    const topics = pp.topics.length > 0 ? pp.topics : aggregateClusterTopics(ticketTopics, pp.ticketIds);
    const uniqueOrgs = new Set(pp.ticketIds.map((id) => core.find((t) => t.id === id)?.org).filter(Boolean));
    const uniquePersons = new Set(pp.ticketIds.map((id) => core.find((t) => t.id === id)?.person).filter(Boolean));
    const scope = calcScopeByOrg(uniqueOrgs.size, uniquePersons.size);
    const dates = pp.ticketIds.map((id) => core.find((t) => t.id === id)?.date).filter((d): d is Date => d != null);
    const trend = calcTrend(dates);
    const confidence = calcConfidence(pp.ticketIds.length, topics.length > 0);

    // Simple title from topics
    const properNouns = topics.filter((t) => /^[A-ZÄÖÅ]/.test(t) && !t.includes(" "));
    const others = topics.filter((t) => !properNouns.includes(t));
    let title: string;
    if (properNouns.length > 0 && others.length > 0) title = `${properNouns[0]} — ${others[0]}`;
    else if (topics.length >= 2) title = `${topics[0]} — ${topics[1]}`;
    else if (topics.length === 1) title = topics[0];
    else title = `Mönster (${pp.ticketIds.length})`;

    return { title, ticketIds: pp.ticketIds, topics: topics.slice(0, 5), scope, trend, confidence };
  });

  const coveredIds = new Set(patterns.flatMap((p) => p.ticketIds));
  const sizes = patterns.map((p) => p.ticketIds.length);
  const totalMs = Date.now() - t0;

  return {
    patterns,
    metrics: {
      total: tickets.length,
      core: core.length,
      noiseFiltered: tickets.length - core.length,
      patternCount: patterns.length,
      coverage: Math.round((coveredIds.size / core.length) * 100),
      orphanRate: Math.round(((core.length - coveredIds.size) / core.length) * 100),
      maxSize: Math.max(...sizes, 0),
      avgSize: sizes.length > 0 ? +(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1) : 0,
      dedupMerged,
      embedMs,
      totalMs,
      catchAll: patterns.filter((p) => p.ticketIds.length > 15).length,
    },
  };
}

// ─── Scenarios ───

type Scenario = {
  name: string;
  description: string;
  generate: () => MockTicket[];
};

const SCENARIOS: Scenario[] = [
  {
    name: "hr-50",
    description: "HR-avdelning, 50 ärenden (sjukfrånvaro, onboarding, lön, arbetsmiljö)",
    generate: () => generateHRData(50),
  },
  {
    name: "hr-200",
    description: "HR-avdelning, 200 ärenden — volymtest",
    generate: () => generateHRData(200),
  },
  {
    name: "phone-80",
    description: "Telefonstatistik kundcenter, 80 ärenden (väntetider, bemanning, system)",
    generate: () => generatePhoneStatsData(80),
  },
  {
    name: "phone-300",
    description: "Telefonstatistik, 300 ärenden — volymtest",
    generate: () => generatePhoneStatsData(300),
  },
  {
    name: "meeting-60",
    description: "Mötesanteckningar, 60 ärenden (projekt, kommunikation, tech debt)",
    generate: () => generateMeetingNotesData(60),
  },
  {
    name: "it-500",
    description: "IT-support, 500 ärenden — stor volym",
    generate: () => generateLargeITData(500),
  },
  {
    name: "mixed-300",
    description: "Blandad data: 100 HR + 100 telefon + 100 IT — domänblandning",
    generate: () => [...generateHRData(100), ...generatePhoneStatsData(100), ...generateLargeITData(100)],
  },
  {
    name: "tiny-10",
    description: "Minimal dataset: 10 ärenden — edge case",
    generate: () => generateHRData(10),
  },
  {
    name: "huge-1000",
    description: "1000 ärenden — prestandatest",
    generate: () => [...generateHRData(250), ...generatePhoneStatsData(250), ...generateMeetingNotesData(250), ...generateLargeITData(250)],
  },
];

// ─── Main ───

async function main() {
  const scenarioArg = process.argv.indexOf("--scenario");
  const filter = scenarioArg >= 0 ? process.argv[scenarioArg + 1] : null;

  const toRun = filter ? SCENARIOS.filter((s) => s.name === filter || s.name.startsWith(filter)) : SCENARIOS;

  if (toRun.length === 0) {
    console.log("Tillgängliga scenarios:", SCENARIOS.map((s) => s.name).join(", "));
    return;
  }

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  V4 Pipeline Stress Test                                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const results: { name: string; metrics: ReturnType<typeof runV4Pipeline> extends Promise<infer R> ? R extends { metrics: infer M } ? M : never : never }[] = [];

  for (const scenario of toRun) {
    console.log(`\n${"═".repeat(62)}`);
    console.log(`${scenario.name}: ${scenario.description}`);
    console.log("═".repeat(62));

    const tickets = scenario.generate();
    const { patterns, metrics } = await runV4Pipeline(tickets);
    results.push({ name: scenario.name, ...{ metrics } });

    console.log(`  Tickets: ${metrics.total} → ${metrics.core} core (${metrics.noiseFiltered} noise)`);
    console.log(`  Patterns: ${metrics.patternCount} | Coverage: ${metrics.coverage}% | Orphans: ${metrics.orphanRate}%`);
    console.log(`  Sizes: max=${metrics.maxSize} avg=${metrics.avgSize} | Catch-all: ${metrics.catchAll}`);
    console.log(`  Dedup: ${metrics.dedupMerged} merged`);
    console.log(`  Time: ${(metrics.totalMs / 1000).toFixed(1)}s (embed: ${(metrics.embedMs / 1000).toFixed(1)}s)\n`);

    // Show patterns
    for (const p of patterns) {
      console.log(`  [${p.scope}/${p.trend}/${p.confidence}] ${p.title} (${p.ticketIds.length})`);
      if (p.topics.length > 0) console.log(`    Topics: ${p.topics.join(", ")}`);
    }
  }

  // Summary table
  console.log(`\n\n${"═".repeat(80)}`);
  console.log("SAMMANFATTNING");
  console.log("═".repeat(80));
  console.log("Scenario        | Tickets | Core | Patterns | Coverage | Max | Avg  | Time");
  console.log("----------------|---------|------|----------|----------|-----|------|------");
  for (const r of results) {
    console.log(
      `${r.name.padEnd(16)}| ${String(r.metrics.total).padStart(7)} | ${String(r.metrics.core).padStart(4)} | ${String(r.metrics.patternCount).padStart(8)} | ${String(r.metrics.coverage + "%").padStart(8)} | ${String(r.metrics.maxSize).padStart(3)} | ${String(r.metrics.avgSize).padStart(4)} | ${(r.metrics.totalMs / 1000).toFixed(1).padStart(4)}s`
    );
  }

  // Pass/fail criteria
  console.log("\n── KVALITETSKONTROLL ──");
  let passed = 0, failed = 0;
  for (const r of results) {
    const checks = [
      { name: "Coverage ≥ 80%", ok: r.metrics.coverage >= 80 },
      { name: "No catch-all (>20)", ok: r.metrics.catchAll === 0 },
      { name: "Max size ≤ 15", ok: r.metrics.maxSize <= 15 },
      { name: "≥ 1 pattern", ok: r.metrics.patternCount >= 1 },
    ];
    const failures = checks.filter((c) => !c.ok);
    if (failures.length === 0) {
      console.log(`  ${r.name}: PASS`);
      passed++;
    } else {
      console.log(`  ${r.name}: FAIL — ${failures.map((f) => f.name).join(", ")}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed out of ${results.length} scenarios`);
}

main().catch(console.error);
