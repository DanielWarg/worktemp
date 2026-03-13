// Local LLM client via llama.cpp server (OpenAI-compatible API)

const LOCAL_BASE_URL = process.env.LOCAL_LLM_URL || "http://127.0.0.1:8080";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type LocalChatResponse = {
  choices: { message: { content: string } }[];
};

export async function localChat(
  messages: ChatMessage[],
  maxTokens = 2000
): Promise<string> {
  const res = await fetch(`${LOCAL_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Local LLM error ${res.status}: ${body}`);
  }

  const data: LocalChatResponse = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// Health check — is the local server running?
export async function isLocalLLMAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_BASE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
