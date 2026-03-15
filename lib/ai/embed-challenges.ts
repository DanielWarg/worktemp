/**
 * Embed challenges using Transformers.js (multilingual MiniLM).
 * Returns 384-dim vectors. Runs on CPU, ~3s for 265 items.
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

// Simple in-memory cache keyed by challenge id
const cache = new Map<string, number[]>();

export async function embedChallenges(
  challenges: ChallengeForEmbed[]
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  const toEmbed: ChallengeForEmbed[] = [];

  for (const c of challenges) {
    const cached = cache.get(c.id);
    if (cached) {
      result.set(c.id, cached);
    } else {
      toEmbed.push(c);
    }
  }

  if (toEmbed.length === 0) return result;

  const embedder = await getEmbedder();

  // Build text representations
  const texts = toEmbed.map((c) => {
    const parts = [c.text];
    if (c.tags?.length) parts.push(`[${c.tags.join(", ")}]`);
    // person excluded — causes same-reporter clustering bias
    return parts.join(" ");
  });

  // Embed all at once — Transformers.js handles batching internally
  const output = await embedder(texts, { pooling: "mean", normalize: true });

  // Extract vectors from the output tensor
  for (let i = 0; i < toEmbed.length; i++) {
    const vec = Array.from((output[i].data ?? output.data.slice(i * EMBED_DIM, (i + 1) * EMBED_DIM)) as Float32Array);
    cache.set(toEmbed[i].id, vec);
    result.set(toEmbed[i].id, vec);
  }

  return result;
}
