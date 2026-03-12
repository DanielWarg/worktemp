"use client";

import { useState } from "react";

type ChallengeInputProps = {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
};

export function ChallengeInput({
  onSubmit,
  placeholder = "Beskriv utmaningen...",
  disabled = false,
}: ChallengeInputProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    await onSubmit(trimmed);
    setContent("");
    setSubmitting(false);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="flex-1 rounded-full border border-white/12 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-[var(--color-mint-400)]/50"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder={placeholder}
        disabled={disabled || submitting}
        autoComplete="off"
      />
      <button
        className="rounded-full bg-[var(--color-mint-400)] px-4 py-3 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-50"
        onClick={handleSubmit}
        disabled={disabled || submitting || !content.trim()}
        type="button"
      >
        {submitting ? "..." : "Fånga"}
      </button>
    </div>
  );
}
