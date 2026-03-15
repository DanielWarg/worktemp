import { NextResponse } from "next/server";
import { isLocalLLMAvailable } from "@/lib/ai/local-client";

// GET /api/ai/status — check which AI providers are available
export async function GET() {
  const localAvailable = await isLocalLLMAvailable();
  const anthropicConfigured = !!process.env.ANTHROPIC_API_KEY;

  return NextResponse.json({
    providers: {
      anthropic: { available: anthropicConfigured, label: "Claude (Anthropic)" },
      local: { available: localAvailable, label: "Ministral (lokal)" },
    },
  });
}
