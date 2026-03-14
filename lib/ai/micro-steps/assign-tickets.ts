/**
 * Step 3: Assign each ticket to exactly one theme.
 * Single cognitive task: "Put each ticket in one bucket."
 *
 * For small clusters (≤8 tickets), uses embedding similarity
 * instead of LLM — saves ~25s per call.
 */

import { localChat } from "../local-client";
import { contextPrefix } from "../context";
import { parseJsonObject } from "./sanitize-json";

export type TicketAssignment = {
  assignments: Map<string, string[]>; // theme → ticket IDs
  unassigned: string[];
  fallbackUsed: boolean;
};

const SMALL_CLUSTER_THRESHOLD = 8;

/**
 * Ask LLM to assign tickets to themes. Validates all IDs appear exactly once.
 * Small clusters use embedding fallback directly.
 */
export async function assignTickets(
  themes: string[],
  tickets: { id: string; text: string }[],
  embeddings: Map<string, number[]>,
  systemContext = ""
): Promise<TicketAssignment> {
  // Small clusters: skip LLM, use embeddings
  if (tickets.length <= SMALL_CLUSTER_THRESHOLD) {
    return embeddingFallback(themes, tickets, embeddings);
  }

  const themeList = themes.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const ticketList = tickets
    .map((t) => `[${t.id}] ${t.text}`)
    .join("\n");

  try {
    const raw = await localChat(
      [
        {
          role: "user",
          content: `${contextPrefix(systemContext)}Placera varje ärende i exakt ETT tema. Om ett ärende inte passar något tema, placera det i "none".

Teman:
${themeList}

Ärenden:
${ticketList}

Returnera BARA JSON-objekt med tema som nyckel och array av ärende-ID som värde. Inkludera "none" om något ärende inte passar.

Exempel: {"TIMS synlighet": ["abc123","def456"], "CAD/AVL": ["ghi789"], "none": ["jkl012"]}

JSON:`,
        },
      ],
      1000
    );

    const parsed = parseJsonObject<Record<string, string[]>>(raw);
    const validIds = new Set(tickets.map((t) => t.id));

    const seenIds = new Set<string>();
    const assignments = new Map<string, string[]>();
    const unassigned: string[] = [];

    for (const [theme, ids] of Object.entries(parsed)) {
      if (!Array.isArray(ids)) continue;
      const validIdsForTheme: string[] = [];

      for (const id of ids) {
        if (typeof id !== "string") continue;
        if (!validIds.has(id)) continue;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        if (theme === "none") {
          unassigned.push(id);
        } else {
          validIdsForTheme.push(id);
        }
      }

      if (theme !== "none" && validIdsForTheme.length > 0) {
        assignments.set(theme, validIdsForTheme);
      }
    }

    for (const t of tickets) {
      if (!seenIds.has(t.id)) {
        unassigned.push(t.id);
      }
    }

    if (assignments.size === 0) throw new Error("No valid assignments");
    return { assignments, unassigned, fallbackUsed: false };
  } catch (err) {
    console.warn("[assign-tickets] LLM failed, using embedding fallback:", err);
    return embeddingFallback(themes, tickets, embeddings);
  }
}

async function embeddingFallback(
  themes: string[],
  tickets: { id: string; text: string }[],
  embeddings: Map<string, number[]>
): Promise<TicketAssignment> {
  const { embedChallenges } = await import("../embed-challenges");
  const themeItems = themes.map((t, i) => ({
    id: `__theme_${i}`,
    text: t,
  }));
  const themeEmbeddings = await embedChallenges(themeItems);

  const themeVecs = themes.map((_, i) => themeEmbeddings.get(`__theme_${i}`));
  const assignments = new Map<string, string[]>();
  const unassigned: string[] = [];

  for (const theme of themes) {
    assignments.set(theme, []);
  }

  for (const ticket of tickets) {
    const ticketVec = embeddings.get(ticket.id);
    if (!ticketVec) {
      unassigned.push(ticket.id);
      continue;
    }

    let bestIdx = -1;
    let bestSim = -1;
    for (let i = 0; i < themes.length; i++) {
      const tv = themeVecs[i];
      if (!tv) continue;
      let dot = 0;
      for (let k = 0; k < ticketVec.length; k++) dot += ticketVec[k] * tv[k];
      if (dot > bestSim) {
        bestSim = dot;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestSim > 0.2) {
      assignments.get(themes[bestIdx])!.push(ticket.id);
    } else {
      unassigned.push(ticket.id);
    }
  }

  return { assignments, unassigned, fallbackUsed: true };
}
