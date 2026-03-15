/**
 * Domain-agnostic topic extraction using n-gram TF-IDF.
 *
 * Replaces entity-extract for v4 pipeline. Works for IT tickets,
 * HR complaints, phone statistics, meeting notes — anything.
 *
 * Topics are internal signals used for grouping, signatures, dedup,
 * and title candidates. They feed into title polish but aren't
 * necessarily the final human-facing label.
 */

// ─── Stop words: Swedish + English ───
const STOP_WORDS = new Set([
  // Swedish
  "och", "att", "det", "som", "för", "med", "har", "kan", "inte", "den",
  "ett", "var", "från", "till", "ska", "vid", "nya", "alla", "efter",
  "när", "utan", "eller", "men", "här", "där", "dess", "hade", "hon",
  "han", "vara", "vill", "ser", "ang", "ärende", "ärenden", "ärendet",
  "detta", "dessa", "behöver", "blir", "borde", "bara", "sedan",
  "också", "redan", "mer", "mycket", "genom", "kunde", "skulle",
  "samma", "andra", "hela", "igen", "flera", "dock", "vad", "hur",
  // English
  "the", "and", "for", "with", "not", "this", "that", "from", "has", "was",
  "are", "have", "been", "will", "can", "new", "all", "about", "into",
  "been", "just", "some", "than", "them", "then", "also", "only",
  // Email prefixes
  "fwd", "fw", "re", "sv", "vb",
  // Ticket/email boilerplate
  "angående", "gäller", "hej", "tack", "mvh", "mailto",
  "ref", "service", "request", "incident",
  "akut", "prio", "hög", "låg", "info", "information",
  // Priority/status
  "normal", "kritisk", "brådskande", "urgent",
  "high", "medium", "low", "critical",
  "öppen", "stängd", "löst", "closed", "open", "resolved",
  // Generic ticket words
  "okänd", "test", "prod", "server", "system", "problem",
  "ärenderubrik", "felanmälan", "beställning",
  "standardklient", "produktion", "klient",
  "used", "free", "less", "more", "some", "like",
  "need", "please", "want", "regarding",
]);

export type TopicResult = {
  topics: string[];     // ranked by TF-IDF score
  signature: string;    // top 3 joined by "|"
};

/**
 * Extract topics from the full corpus using n-gram TF-IDF.
 * Returns per-ticket topic results.
 */
export function extractCorpusTopics(
  tickets: { id: string; text: string; tags: string[] }[],
): Map<string, TopicResult> {
  const n = tickets.length;
  if (n === 0) return new Map();

  // Tokenize each ticket into unigrams + bigrams
  const ticketNgrams = new Map<string, Map<string, number>>();
  const docFreq = new Map<string, number>();

  for (const t of tickets) {
    const combined = [t.text, ...t.tags].join(" ");
    const ngrams = tokenizeNgrams(combined);
    ticketNgrams.set(t.id, ngrams);

    // Count document frequency (each term counted once per doc)
    for (const term of ngrams.keys()) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  // Filter: keep terms with DF >= 2 AND DF <= 40% of corpus
  const maxDf = Math.ceil(n * 0.4);
  const validTerms = new Set<string>();
  for (const [term, df] of docFreq) {
    if (df >= 2 && df <= maxDf) {
      validTerms.add(term);
    }
  }

  // Score each ticket's terms using TF-IDF with proper noun boost
  const result = new Map<string, TopicResult>();
  for (const t of tickets) {
    const ngrams = ticketNgrams.get(t.id)!;
    const scored: [string, number][] = [];

    for (const [term, tf] of ngrams) {
      if (!validTerms.has(term)) continue;
      const df = docFreq.get(term)!;
      let score = tf * Math.log(n / df);

      // Proper noun boost: ALLCAPS (≥3 chars) or CamelCase get 2x
      if (isProperNoun(term)) {
        score *= 2;
      }

      scored.push([term, score]);
    }

    scored.sort((a, b) => b[1] - a[1]);
    const topics = scored.slice(0, 5).map(([term]) => term);
    const signature = topics.slice(0, 3).join("|") || "UNKNOWN";

    result.set(t.id, { topics, signature });
  }

  return result;
}

/**
 * Aggregate topics across a cluster of tickets.
 * Returns ranked cluster-level topics by total TF-IDF score.
 */
export function aggregateClusterTopics(
  ticketTopics: Map<string, TopicResult>,
  ticketIds: string[],
): string[] {
  const topicScore = new Map<string, number>();
  const topicCount = new Map<string, number>();

  for (const id of ticketIds) {
    const tr = ticketTopics.get(id);
    if (!tr) continue;
    for (let i = 0; i < tr.topics.length; i++) {
      const topic = tr.topics[i];
      // Weight by position: top topic gets 5, second gets 4, etc.
      const weight = 5 - i;
      topicScore.set(topic, (topicScore.get(topic) || 0) + weight);
      topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
    }
  }

  // Require topic to appear in at least 2 tickets (unless cluster is tiny)
  const minAppearance = ticketIds.length <= 3 ? 1 : 2;

  const ranked = [...topicScore.entries()]
    .filter(([topic]) => (topicCount.get(topic) || 0) >= minAppearance)
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic);

  // Deduplicate: remove bigrams where both parts are already in the list as unigrams
  // e.g. "pubtrans tims" is redundant if "PubTrans" and "TIMS" are already present
  return ranked.filter((topic) => {
    if (!topic.includes(" ")) return true; // keep unigrams
    const parts = topic.split(" ");
    const coveredByUnigrams = parts.every((part) =>
      ranked.some((other) => !other.includes(" ") && other.toLowerCase() === part.toLowerCase())
    );
    return !coveredByUnigrams;
  });
}

// ─── Internal helpers ───

function tokenizeNgrams(text: string): Map<string, number> {
  const freq = new Map<string, number>();

  // Clean text: remove reference IDs, hex codes, email addresses
  const cleaned = text
    .replace(/\b(IS-|INC-|REF|REQ|SESD-|CAS-|CS)\d+\b/gi, "")
    .replace(/\b[0-9A-F]{6,}\b/gi, "")
    .replace(/\S+@\S+/g, "")
    .replace(/["""''`«»]/g, "")
    .replace(/[()[\]{}<>]/g, " ");

  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/^[.,;:!?]+|[.,;:!?]+$/g, ""))
    .filter((w) => w.length >= 2);

  // Unigrams
  for (const w of words) {
    // Keep original case for proper nouns, lowercase for rest
    const key = isProperNoun(w) ? w : w.toLowerCase();
    if (key.length < 2) continue;
    if (STOP_WORDS.has(key.toLowerCase())) continue;
    if (/^\d+$/.test(key)) continue;
    if (/^\d+\.\d+/.test(key)) continue;
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  // Bigrams (always lowercased for matching)
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i].toLowerCase();
    const b = words[i + 1].toLowerCase();
    if (STOP_WORDS.has(a) || STOP_WORDS.has(b)) continue;
    if (a.length < 2 || b.length < 2) continue;
    if (/^\d+$/.test(a) || /^\d+$/.test(b)) continue;
    const bigram = `${a} ${b}`;
    freq.set(bigram, (freq.get(bigram) || 0) + 1);
  }

  return freq;
}

function isProperNoun(word: string): boolean {
  // ALLCAPS (≥3 chars)
  if (/^[A-ZÄÖÅ][A-ZÄÖÅ0-9]{2,}$/.test(word)) return true;
  // CamelCase
  if (/^[A-ZÄÖÅ][a-zäöå]+[A-ZÄÖÅ]/.test(word)) return true;
  return false;
}
