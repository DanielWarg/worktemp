/**
 * Deterministic pre-classifier for challenges/tickets.
 * Runs before LLM to tag noise, duplicates, and ticket types.
 * No AI involved — pure regex + heuristics.
 */

export type TicketClass =
  | "monitoring_alert"
  | "forwarded_email"
  | "duplicate_candidate"
  | "administrative"
  | "config_change"
  | "customer_incident"
  | "unknown";

export type ClassifiedItem = {
  id: string;
  ticketClass: TicketClass;
  isNoise: boolean;
};

// Monitoring alerts: [NR], HeartBeat, SQLJob, FileCompare, PerfCounter, DiskFreeSpace, LowJourneyCount
const MONITORING_PATTERNS = [
  /^\[NR\]/i,
  /HeartBeat/i,
  /SQLJob[:\s]/i,
  /FileCompare[:\s]/i,
  /PerfCounter[:\s]/i,
  /DiskFreeSpace/i,
  /LowJourneyCount/i,
  /Service not running/i,
  /Ping\s+\w+/i,
  /Filstorlek[:\s]/i,
  /Replikeringskö/i,
  /FolderSize[:\s]/i,
  /CertificateCheck/i,
  /DatabaseBackup/i,
  /DatabaseIntegrityCheck/i,
  /IndexOptimize/i,
  /ReceiveQueueLength/i,
  /SyncronizationsState/i,
  /RabbitMQ/i,
  /messages_ready/i,
  /Queue messages/i,
  /Failover cluster/i,
];

// Forwarded/replied emails
const FORWARD_PATTERNS = [
  /^(FW|Fwd|VB|SV|RE):\s/i,
];

// Administrative (meetings, subscriptions, questions)
const ADMIN_PATTERNS = [
  /möte\b/i,
  /meeting\b/i,
  /prenumeration/i,
  /fråga\b/i,
  /stämmer följande/i,
  /utbildning\b/i,
];

// Config/infrastructure changes
const CONFIG_PATTERNS = [
  /infraändring/i,
  /zonjustering/i,
  /körlänk/i,
  /polygon/i,
  /hållplats.*flytt/i,
  /servicefönster/i,
  /maintenance/i,
  /MAC.?adress/i,
  /avinstallera/i,
  /patchning/i,
  /uppgradering/i,
];

/**
 * Classify a single ticket by title + tags.
 */
export function classifyTicket(title: string, _tags: string[] = []): { ticketClass: TicketClass; isNoise: boolean } {
  const text = title.trim();

  // Monitoring alerts — highest priority, these are auto-generated
  if (MONITORING_PATTERNS.some((p) => p.test(text))) {
    return { ticketClass: "monitoring_alert", isNoise: true };
  }

  // Config/infrastructure changes
  if (CONFIG_PATTERNS.some((p) => p.test(text))) {
    return { ticketClass: "config_change", isNoise: false };
  }

  // Administrative
  if (ADMIN_PATTERNS.some((p) => p.test(text))) {
    return { ticketClass: "administrative", isNoise: true };
  }

  // Forwarded emails — these are real incidents forwarded internally, not noise
  if (FORWARD_PATTERNS.some((p) => p.test(text))) {
    return { ticketClass: "forwarded_email", isNoise: false };
  }

  // Default: customer incident
  return { ticketClass: "customer_incident", isNoise: false };
}

/**
 * Find duplicate candidates: same title (normalized) from same person
 * within the same session or import batch.
 *
 * Cross-session duplicates are intentionally kept — they prove a recurring issue.
 * Only within-batch duplicates (copy-paste, double-submit) are filtered.
 */
export function findDuplicates(items: { id: string; text: string; person: string; batchKey?: string }[]): Set<string> {
  const seen = new Map<string, string>(); // normalized key → first id
  const dupes = new Set<string>();

  for (const item of items) {
    // Scope dedup to the same batch (session/import). Cross-batch = recurring, not duplicate.
    const batch = item.batchKey ?? "__global__";
    const key = `${batch}::${item.person}::${normalizeTitle(item.text)}`;
    if (seen.has(key)) {
      dupes.add(item.id);
    } else {
      seen.set(key, item.id);
    }
  }
  return dupes;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(fw|fwd|vb|sv|re):\s*/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[#\[\](){}]/g, "")
    .trim();
}

/**
 * Build batch-level aggregate context for the LLM prompt.
 */
export function buildBatchContext(
  items: { id: string; person: string; tags: string[]; text: string }[],
  classifications: Map<string, { ticketClass: TicketClass; isNoise: boolean }>
): string {
  // Person distribution
  const personCount = new Map<string, number>();
  for (const item of items) {
    personCount.set(item.person, (personCount.get(item.person) || 0) + 1);
  }
  const topPersons = [...personCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `${name} (${count})`)
    .join(", ");

  // Tag distribution
  const tagCount = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    }
  }
  const topTags = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => `${tag} (${count})`)
    .join(", ");

  // Classification distribution
  const classCount = new Map<string, number>();
  let noiseCount = 0;
  for (const item of items) {
    const cls = classifications.get(item.id);
    if (cls) {
      classCount.set(cls.ticketClass, (classCount.get(cls.ticketClass) || 0) + 1);
      if (cls.isNoise) noiseCount++;
    }
  }
  const classDist = [...classCount.entries()]
    .map(([cls, count]) => `${cls}: ${count}`)
    .join(", ");

  const lines: string[] = [];
  lines.push(`BATCHKONTEXT (${items.length} ärenden):`);
  lines.push(`  Kunder: ${topPersons}`);
  lines.push(`  Produkter/taggar: ${topTags}`);
  lines.push(`  Ärendetyper: ${classDist}`);
  if (noiseCount > 0) {
    lines.push(`  Brus (larm/admin): ${noiseCount} st — dessa är ofta auto-genererade och utgör sällan egna mönster`);
  }

  return lines.join("\n");
}
