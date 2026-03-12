export const TEAM_COLORS = ["#5BBFA0", "#D5AB85", "#78B9D9", "#B7C98E"];

export function colorToCssClass(color: string): string {
  const map: Record<string, string> = {
    "#5BBFA0": "bg-[var(--color-mint-400)]",
    "#D5AB85": "bg-[var(--color-copper-400)]",
    "#78B9D9": "bg-[var(--color-sky-400)]",
    "#B7C98E": "bg-[var(--color-olive-300)]",
  };
  return map[color] ?? "bg-[var(--color-mint-400)]";
}

export function initialsFromName(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (tokens.length === 0) return "NY";
  return tokens.map((t) => t[0]?.toUpperCase() ?? "").join("");
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function stalenessLabel(lastActiveAt: string | null): string | null {
  if (!lastActiveAt) return null;
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 7) return null;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}v sedan senaste input`;
  const months = Math.floor(days / 30);
  return `${months}mån sedan senaste input`;
}
