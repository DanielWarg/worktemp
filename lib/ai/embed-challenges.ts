/**
 * Embed challenges using Transformers.js (all-MiniLM-L6-v2).
 * Returns 384-dim vectors. Runs on CPU, ~2s for 265 items.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelinePromise: Promise<any> | null = null;

async function getEmbedder() {
  if (!pipelinePromise) {
    // Dynamic require to prevent webpack from bundling the heavy ONNX runtime
    const moduleName = "@huggingface/transformers";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require(moduleName);
    pipelinePromise = m.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "fp32" });
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
    if (c.person) parts.push(`(${c.person})`);
    return parts.join(" ");
  });

  // Embed all at once — Transformers.js handles batching internally
  const output = await embedder(texts, { pooling: "mean", normalize: true });

  // Extract vectors from the output tensor
  for (let i = 0; i < toEmbed.length; i++) {
    const vec = Array.from((output[i].data ?? output.data.slice(i * 384, (i + 1) * 384)) as Float32Array);
    cache.set(toEmbed[i].id, vec);
    result.set(toEmbed[i].id, vec);
  }

  return result;
}
