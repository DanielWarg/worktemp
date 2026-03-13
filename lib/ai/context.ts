// Build a context prefix for AI prompts from user-provided domain description
export function contextPrefix(systemContext: string): string {
  if (!systemContext) return "";
  return `Kontext om datan: ${systemContext}\n\n`;
}
