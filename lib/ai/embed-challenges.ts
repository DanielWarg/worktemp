/**
 * Embed challenges using Transformers.js (multilingual MiniLM).
 * Returns 384-dim vectors. Runs on CPU, ~3s for 265 items.
 *
 * Three-level lookup: memory cache → DB → compute.
 * New embeddings are persisted to DB for reuse across restarts.
 */

export const EMBED_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const EMBED_DIM = 384;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelinePromise: Promise<any> | null = null;

async function getEmbedder() {
  if (!pipelinePromise) {
    pipelinePromise = import("@huggingface/transformers").then((m) =>
      m.pipeline("feature-extraction", EMBED_MODEL, { dtype: "fp32" })
    );
  }
  return pipelinePromise;
}

export type ChallengeForEmbed = {
  id: string;
  text: string;
  tags?: string[];
  person?: string;
};

// LRU memory cache — capped to prevent leaks
const CACHE_MAX = 5000;
const cache = new Map<string, number[]>();

/** Convert Float32Array ↔ Uint8Array for DB storage */
function vecToBytes(vec: number[]): Uint8Array<ArrayBuffer> {
  const f32 = new Float32Array(vec);
  return new Uint8Array(f32.buffer) as Uint8Array<ArrayBuffer>;
}

function bytesToVec(bytes: Uint8Array): number[] {
  const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  return Array.from(f32);
}

/**
 * Load persisted embeddings from DB for given IDs.
 * Returns only IDs that have stored embeddings.
 */
async function loadFromDB(ids: string[]): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  if (ids.length === 0) return result;

  try {
    const { prisma } = await import("@/lib/db/prisma");
    const rows = await prisma.challenge.findMany({
      where: { id: { in: ids }, embedding: { not: null } },
      select: { id: true, embedding: true },
    });
    for (const row of rows) {
      if (row.embedding) {
        const vec = bytesToVec(new Uint8Array(row.embedding));
        if (vec.length === EMBED_DIM) {
          result.set(row.id, vec);
        }
      }
    }
  } catch {
    // DB unavailable (eval scripts, tests) — silently skip
  }

  return result;
}

/**
 * Persist embeddings to DB for given IDs.
 */
async function saveToDB(embeddings: Map<string, number[]>): Promise<void> {
  if (embeddings.size === 0) return;

  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$transaction(
      [...embeddings.entries()].map(([id, vec]) =>
        prisma.challenge.update({
          where: { id },
          data: { embedding: vecToBytes(vec) },
        })
      )
    );
  } catch {
    // DB unavailable or IDs don't exist (eval scripts) — silently skip
  }
}

export async function embedChallenges(
  challenges: ChallengeForEmbed[]
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  let toEmbed: ChallengeForEmbed[] = [];

  // Level 1: Memory cache
  for (const c of challenges) {
    const cached = cache.get(c.id);
    if (cached) {
      result.set(c.id, cached);
    } else {
      toEmbed.push(c);
    }
  }

  if (toEmbed.length === 0) return result;

  // Level 2: DB-persisted embeddings
  const fromDB = await loadFromDB(toEmbed.map((c) => c.id));
  for (const [id, vec] of fromDB) {
    result.set(id, vec);
    cache.set(id, vec);
  }
  toEmbed = toEmbed.filter((c) => !fromDB.has(c.id));

  if (toEmbed.length === 0) return result;

  // Level 3: Compute new embeddings
  const embedder = await getEmbedder();

  const texts = toEmbed.map((c) => {
    const parts = [c.text];
    if (c.tags?.length) parts.push(`[${c.tags.join(", ")}]`);
    return parts.join(" ");
  });

  const output = await embedder(texts, { pooling: "mean", normalize: true });

  const newEmbeddings = new Map<string, number[]>();
  for (let i = 0; i < toEmbed.length; i++) {
    const vec = Array.from((output[i].data ?? output.data.slice(i * EMBED_DIM, (i + 1) * EMBED_DIM)) as Float32Array);
    if (cache.size >= CACHE_MAX) {
      const first = cache.keys().next().value!;
      cache.delete(first);
    }
    cache.set(toEmbed[i].id, vec);
    result.set(toEmbed[i].id, vec);
    newEmbeddings.set(toEmbed[i].id, vec);
  }

  // Persist to DB (fire-and-forget — don't block pipeline)
  saveToDB(newEmbeddings);

  return result;
}
