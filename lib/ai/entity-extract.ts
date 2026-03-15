/**
 * Domain-agnostic entity extraction.
 *
 * Learns entities from the data itself — no hardcoded system lists.
 * Three sources:
 *   1. Proper nouns in text (CamelCase, ALLCAPS ≥3 chars)
 *   2. Proper nouns extracted FROM tags (not raw tag strings)
 *   3. Corpus-level discovery (TF-IDF-like frequency filtering)
 *
 * Action keywords are universal Swedish/English support vocabulary.
 */

// ─── Universal action/symptom keywords (domain-agnostic) ───
const ACTIONS = [
  "saknas", "fel", "fungerar inte", "funkar inte", "synlighet", "inloggning",
  "import", "export", "uppgradering", "integration", "konfiguration",
  "kraschar", "hänger", "timeout", "långsam", "trasig",
  "certifikat", "backup", "anslutning", "behörighet",
  "problem", "error", "failure", "missing", "broken",
  "nere", "nedlagd", "avbrott", "störning", "driftstörning",
] as const;

const ACTION_PATTERNS = ACTIONS.map((a) => ({
  name: a,
  pattern: new RegExp(`\\b${a}\\b`, "i"),
}));

// ─── Stop words: never entities ───
const STOP_WORDS = new Set([
  // Swedish
  "och", "att", "det", "som", "för", "med", "har", "kan", "inte", "den",
  "ett", "var", "från", "till", "ska", "vid", "nya", "alla", "efter",
  "när", "utan", "eller", "men", "här", "där", "dess", "hade", "hon",
  "han", "vara", "vill", "ser", "ang", "ärende", "ärenden", "ärendet",
  "detta", "dessa", "behöver", "blir", "borde", "bara", "sedan",
  // English
  "the", "and", "for", "with", "not", "this", "that", "from", "has", "was",
  "are", "have", "been", "will", "can", "new", "all", "about", "into",
  // Email prefixes (always noise in tickets)
  "fwd", "fw", "re", "sv", "vb",
  // Ticket/email boilerplate
  "angående", "gäller", "hej", "tack", "mvh", "mailto",
  "ref", "service", "request", "ärende", "incident", "problem",
  "akut", "prio", "hög", "låg", "info", "information",
  // Generic words that look like proper nouns but aren't
  "okänd", "test", "prod", "dev", "staging", "server",
]);

export type ExtractedEntities = {
  systems: string[];
  actions: string[];
  signature: string;
};

/**
 * Extract entities from text using universal proper-noun heuristics.
 */
export function extractEntities(text: string): ExtractedEntities {
  const systems = extractProperNouns(text);

  const actions: string[] = [];
  for (const { name, pattern } of ACTION_PATTERNS) {
    if (pattern.test(text)) actions.push(name);
  }

  const sigParts = [...systems].sort();
  if (actions.length > 0) sigParts.push(actions[0]);
  const signature = sigParts.join("|") || "UNKNOWN";

  return { systems, actions, signature };
}

/**
 * Extract entities FROM tag text (not raw tags as entities).
 * Tags like "4 PubTrans 5 TIMS" → extract "PubTrans", "TIMS".
 */
export function extractEntitiesFromTags(tags: string[]): ExtractedEntities {
  const combined = tags.join(" ");
  // Extract proper nouns from tag text — same heuristics as free text
  const systems = extractProperNouns(combined);
  return { systems, actions: [], signature: systems.sort().join("|") || "UNKNOWN" };
}

/**
 * Merge entities from multiple sources, deduplicating.
 */
export function mergeEntities(a: ExtractedEntities, b: ExtractedEntities): ExtractedEntities {
  const systems = [...new Set([...a.systems, ...b.systems])];
  const actions = [...new Set([...a.actions, ...b.actions])];
  const sigParts = [...systems].sort();
  if (actions.length > 0) sigParts.push(actions[0]);
  const signature = sigParts.join("|") || "UNKNOWN";
  return { systems, actions, signature };
}

// ─── Proper noun extraction ───

/**
 * Extract likely system/product names from text:
 * - ALLCAPS words ≥3 chars (TIMS, OCA, SQL) — excludes FW, VB, RE
 * - CamelCase words (PubTrans, TransitCloud, InGrid)
 * - Capitalized words mid-sentence ≥4 chars (after lowercase context)
 */
function extractProperNouns(text: string): string[] {
  const results = new Set<string>();

  // ALLCAPS tokens (≥3 chars, not just numbers, not reference IDs)
  const capsPattern = /\b([A-ZÄÖÅ][A-ZÄÖÅ0-9]{2,19})\b/g;
  let match;
  while ((match = capsPattern.exec(text)) !== null) {
    const word = match[1];
    if (!isNoiseToken(word)) results.add(word);
  }

  // CamelCase tokens (PubTrans, InGrid, TransitCloud)
  const camelPattern = /\b([A-ZÄÖÅ][a-zäöå]{1,}[A-ZÄÖÅ][a-zA-ZäöåÄÖÅ0-9]*)\b/g;
  while ((match = camelPattern.exec(text)) !== null) {
    const word = match[1];
    if (!isNoiseToken(word)) results.add(word);
  }

  // Capitalized words mid-sentence (≥4 chars, after lowercase context)
  const midCapPattern = /[a-zäöå.,;:]\s+([A-ZÄÖÅ][a-zäöåA-ZÄÖÅ0-9]{3,})\b/g;
  while ((match = midCapPattern.exec(text)) !== null) {
    const word = match[1];
    if (!isNoiseToken(word)) results.add(word);
  }

  return [...results];
}

function isNoiseToken(word: string): boolean {
  if (word.length < 3) return true;
  if (STOP_WORDS.has(word.toLowerCase())) return true;
  // Pure numbers
  if (/^\d+$/.test(word)) return true;
  // Date-like
  if (/^\d{4}[-_]\d{2}/.test(word)) return true;
  // Reference/ticket numbers
  if (/^(IS-|INC-|REF|REQ|SESD-|CAS-|CS\d)/i.test(word)) return true;
  // Hex/UUID-like
  if (/^[0-9A-F]{6,}$/i.test(word)) return true;
  // File paths / URLs
  if (word.includes("/") || word.includes("\\") || word.includes("@")) return true;
  // Version-like (e.g. "11.2")
  if (/^\d+\.\d+/.test(word)) return true;
  return false;
}

// ─── Corpus-level entity discovery ───

/**
 * Discover domain entities from the full corpus using TF-IDF-like scoring.
 * Terms that appear in 2+ tickets but ≤50% of all tickets are discriminating.
 */
export function discoverCorpusEntities(
  tickets: { id: string; text: string; tags: string[] }[],
): Map<string, string[]> {
  const n = tickets.length;
  if (n < 5) return new Map();

  // Count document frequency for each proper noun
  const docFreq = new Map<string, number>();
  const ticketNouns = new Map<string, Set<string>>();

  for (const t of tickets) {
    const textNouns = extractProperNouns(t.text);
    const tagNouns = extractProperNouns(t.tags.join(" "));
    const nouns = new Set([...textNouns, ...tagNouns]);
    ticketNouns.set(t.id, nouns);
    for (const noun of nouns) {
      docFreq.set(noun, (docFreq.get(noun) || 0) + 1);
    }
  }

  // Keep entities in 2+ tickets but ≤50% of corpus
  const maxFreq = Math.ceil(n * 0.5);
  const validEntities = new Set<string>();
  for (const [entity, freq] of docFreq) {
    if (freq >= 2 && freq <= maxFreq) {
      validEntities.add(entity);
    }
  }

  // Return per-ticket entity lists
  const result = new Map<string, string[]>();
  for (const [id, nouns] of ticketNouns) {
    const filtered = [...nouns].filter((n) => validEntities.has(n));
    result.set(id, filtered);
  }

  return result;
}
