/**
 * Sanitize LLM output for JSON parsing.
 * Ministral often emits control characters (tab, newline) inside JSON strings.
 */

export function sanitizeJson(raw: string): string {
  // Strip control characters inside string values (but keep structural \n between fields)
  // Replace actual tab/newline inside JSON strings with spaces
  return raw.replace(
    /"(?:[^"\\]|\\.)*"/g,
    (match) => match
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "") // Remove control chars
      .replace(/\t/g, " ")  // Tab → space
      .replace(/\n/g, " ")  // Newline → space
      .replace(/\r/g, "")   // CR → remove
  );
}

export function parseJsonArray<T>(raw: string): T[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON array found");
  return JSON.parse(sanitizeJson(match[0]));
}

export function parseJsonObject<T>(raw: string): T {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found");
  return JSON.parse(sanitizeJson(match[0]));
}
