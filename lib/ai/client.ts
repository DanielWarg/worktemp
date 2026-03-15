import Anthropic from "@anthropic-ai/sdk";

const globalForAnthropic = globalThis as { anthropic?: Anthropic };

export function getAnthropicClient(): Anthropic {
  if (!globalForAnthropic.anthropic) {
    globalForAnthropic.anthropic = new Anthropic();
  }
  return globalForAnthropic.anthropic;
}
