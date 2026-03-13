/**
 * Evaluate and compare Ministral (local) vs Claude (Anthropic) analysis
 * on the HPTS support backlog Excel data.
 *
 * Usage: npx tsx scripts/eval-compare.ts
 */

import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "fs";
import { config } from "dotenv";

// Load .env from project root
config({ path: new URL("../.env", import.meta.url).pathname });

const XLSX_PATH = "/Users/evil/Downloads/HPTS Support - Backlog 2026_03_13 10-00-01.xlsx";
const LOCAL_URL = "http://127.0.0.1:8080/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

// ── Parse Excel ──────────────────────────────────────────────────────────

function loadTickets() {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws);
  return rows.map((r, i) => ({
    id: i + 1,
    title: r["Ärenderubrik"] || "",
    type: r["Ärendetyp"] || "",
    priority: r["Prioritet"] || "",
    account: r["Kontonamn"] || "",
    description: (r["Beskrivning"] || "").slice(0, 300),
  }));
}

// ── Prompt builder ───────────────────────────────────────────────────────

function buildPrompt(tickets: ReturnType<typeof loadTickets>) {
  const ticketList = tickets
    .map(
      (t) =>
        `${t.id}. "${t.title}" | Kund: ${t.account} | Typ: ${t.type} | Prio: ${t.priority}${
          t.description ? ` | Beskrivning: ${t.description}` : ""
        }`
    )
    .join("\n");

  return `Du analyserar supportärenden från ett kollektivtrafikföretag (HPTS). Identifiera mönster och kategorier.

Ärenden (${tickets.length} st):
${ticketList}

Uppgifter:
1. KATEGORISERA: Gruppera ärendena i kategorier (t.ex. "TIMS-problem", "Instant-avvikelser", etc.)
2. MÖNSTER: Identifiera återkommande problem eller trender
3. KUNDER: Vilka kunder har flest ärenden? Finns mönster per kund?
4. PRIORITERINGSFÖRSLAG: Vilka problem borde adresseras först?

Svara i JSON:
{
  "categories": [{"name": "...", "ticketIds": [1,2,3], "count": 3, "description": "..."}],
  "patterns": [{"title": "...", "description": "...", "severity": "high|medium|low", "ticketIds": [1,2]}],
  "topCustomers": [{"name": "...", "ticketCount": 5, "mainIssues": "..."}],
  "priorityActions": ["Åtgärd 1", "Åtgärd 2"]
}`;
}

// ── Call local Ministral ─────────────────────────────────────────────────

async function callLocal(prompt: string): Promise<{ text: string; durationMs: number }> {
  const start = Date.now();
  const res = await fetch(LOCAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4000,
      temperature: 0.3,
      stream: false,
    }),
  });
  const data = await res.json();
  const durationMs = Date.now() - start;
  const text = data.choices?.[0]?.message?.content ?? "";
  return { text, durationMs };
}

// ── Call Claude ───────────────────────────────────────────────────────────

async function callClaude(prompt: string): Promise<{ text: string; durationMs: number }> {
  const start = Date.now();
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  const durationMs = Date.now() - start;
  const text = data.content?.[0]?.text ?? "";
  return { text, durationMs };
}

// ── Parse JSON from response ─────────────────────────────────────────────

function extractJSON(text: string) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("Loading tickets...");
  const tickets = loadTickets();
  console.log(`Loaded ${tickets.length} tickets\n`);

  const prompt = buildPrompt(tickets);

  // Run both in parallel
  console.log("Running analysis with both models...\n");
  console.log("  → Ministral 14B (lokal, llama.cpp)");
  console.log("  → Claude Sonnet (Anthropic API)\n");

  const [localResult, claudeResult] = await Promise.all([
    callLocal(prompt).catch((e) => ({ text: `ERROR: ${e.message}`, durationMs: 0 })),
    ANTHROPIC_KEY
      ? callClaude(prompt).catch((e) => ({ text: `ERROR: ${e.message}`, durationMs: 0 }))
      : Promise.resolve({ text: "SKIPPED: No ANTHROPIC_API_KEY", durationMs: 0 }),
  ]);

  console.log(`Ministral: ${(localResult.durationMs / 1000).toFixed(1)}s`);
  console.log(`Claude:    ${(claudeResult.durationMs / 1000).toFixed(1)}s\n`);

  const localJSON = extractJSON(localResult.text);
  const claudeJSON = extractJSON(claudeResult.text);

  // ── Build comparison report ──────────────────────────────────────────

  const lines: string[] = [];
  const hr = "═".repeat(80);
  const sr = "─".repeat(80);

  lines.push(hr);
  lines.push("  UTVÄRDERING: Ministral 14B (offline) vs Claude Sonnet (online)");
  lines.push(`  Data: HPTS Support Backlog — ${tickets.length} ärenden`);
  lines.push(`  Datum: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(hr);
  lines.push("");

  // Timing
  lines.push("▸ PRESTANDA");
  lines.push(sr);
  lines.push(`  Ministral:  ${(localResult.durationMs / 1000).toFixed(1)}s (lokal GPU)`);
  lines.push(`  Claude:     ${(claudeResult.durationMs / 1000).toFixed(1)}s (API)`);
  lines.push("");

  // Categories comparison
  lines.push("▸ KATEGORIER");
  lines.push(sr);

  const localCats = localJSON?.categories ?? [];
  const claudeCats = claudeJSON?.categories ?? [];

  lines.push(`  Ministral hittade ${localCats.length} kategorier:`);
  for (const c of localCats) {
    lines.push(`    • ${c.name} (${c.count} ärenden) — ${c.description || ""}`);
  }
  lines.push("");
  lines.push(`  Claude hittade ${claudeCats.length} kategorier:`);
  for (const c of claudeCats) {
    lines.push(`    • ${c.name} (${c.count} ärenden) — ${c.description || ""}`);
  }
  lines.push("");

  // Patterns
  lines.push("▸ MÖNSTER");
  lines.push(sr);

  const localPatterns = localJSON?.patterns ?? [];
  const claudePatterns = claudeJSON?.patterns ?? [];

  lines.push(`  Ministral hittade ${localPatterns.length} mönster:`);
  for (const p of localPatterns) {
    lines.push(`    [${(p.severity || "?").toUpperCase()}] ${p.title}`);
    lines.push(`      ${p.description || ""}`);
  }
  lines.push("");
  lines.push(`  Claude hittade ${claudePatterns.length} mönster:`);
  for (const p of claudePatterns) {
    lines.push(`    [${(p.severity || "?").toUpperCase()}] ${p.title}`);
    lines.push(`      ${p.description || ""}`);
  }
  lines.push("");

  // Top customers
  lines.push("▸ TOPP-KUNDER");
  lines.push(sr);

  const localCust = localJSON?.topCustomers ?? [];
  const claudeCust = claudeJSON?.topCustomers ?? [];

  lines.push("  Ministral:");
  for (const c of localCust) {
    lines.push(`    • ${c.name} (${c.ticketCount} ärenden) — ${c.mainIssues || ""}`);
  }
  lines.push("  Claude:");
  for (const c of claudeCust) {
    lines.push(`    • ${c.name} (${c.ticketCount} ärenden) — ${c.mainIssues || ""}`);
  }
  lines.push("");

  // Priority actions
  lines.push("▸ PRIORITERADE ÅTGÄRDER");
  lines.push(sr);

  lines.push("  Ministral:");
  for (const a of localJSON?.priorityActions ?? []) {
    lines.push(`    → ${a}`);
  }
  lines.push("  Claude:");
  for (const a of claudeJSON?.priorityActions ?? []) {
    lines.push(`    → ${a}`);
  }
  lines.push("");

  // Coverage analysis
  lines.push("▸ TÄCKNING");
  lines.push(sr);

  const localCoveredIds = new Set<number>();
  for (const c of localCats) for (const id of c.ticketIds ?? []) localCoveredIds.add(id);
  const claudeCoveredIds = new Set<number>();
  for (const c of claudeCats) for (const id of c.ticketIds ?? []) claudeCoveredIds.add(id);

  lines.push(`  Ministral: ${localCoveredIds.size}/${tickets.length} ärenden kategoriserade (${Math.round(localCoveredIds.size / tickets.length * 100)}%)`);
  lines.push(`  Claude:    ${claudeCoveredIds.size}/${tickets.length} ärenden kategoriserade (${Math.round(claudeCoveredIds.size / tickets.length * 100)}%)`);
  lines.push("");

  // Overlap
  const overlap = [...localCoveredIds].filter((id) => claudeCoveredIds.has(id));
  lines.push(`  Överlapp: ${overlap.length} ärenden kategoriserade av båda`);

  lines.push("");
  lines.push(hr);

  const report = lines.join("\n");
  console.log(report);

  // Save report
  const outPath = "/Users/evil/Desktop/EVIL/PROJEKT/worktemp/eval-report.txt";
  writeFileSync(outPath, report, "utf-8");
  console.log(`\nRapport sparad: ${outPath}`);

  // Also save raw JSON for deeper analysis
  const rawPath = "/Users/evil/Desktop/EVIL/PROJEKT/worktemp/eval-raw.json";
  writeFileSync(
    rawPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        ticketCount: tickets.length,
        local: { durationMs: localResult.durationMs, parsed: localJSON, raw: localResult.text },
        claude: { durationMs: claudeResult.durationMs, parsed: claudeJSON, raw: claudeResult.text },
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`Rå-data sparad: ${rawPath}`);
}

main().catch(console.error);
