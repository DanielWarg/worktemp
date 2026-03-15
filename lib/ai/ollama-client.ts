/**
 * Ollama client — OpenAI-compatible API.
 * GPT-OSS returns reasoning in a separate field; we extract content only.
 */

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type OllamaResponse = {
  choices: { message: { content: string; reasoning?: string }; finish_reason?: string }[];
};

const DEFAULT_URL = "http://127.0.0.1:11434";

export async function ollamaChat(
  messages: ChatMessage[],
  maxTokens = 2000,
  model = "gpt-oss:20b"
): Promise<string> {
  const baseUrl = process.env.OLLAMA_URL || DEFAULT_URL;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama error ${res.status}: ${body}`);
  }

  const data: OllamaResponse = await res.json();
  const msg = data.choices?.[0]?.message;
  // Some models (Qwen3) put thinking in `reasoning` and answer in `content`.
  // If content is empty but reasoning exists, the model ran out of tokens before answering.
  return msg?.content || "";
}
