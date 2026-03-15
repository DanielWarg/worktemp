"use client";

import { useEffect, useState } from "react";
import { TagData } from "./types";
import { api } from "./helpers";

type TagInputProps = {
  challengeId: string;
  workspaceId: string;
  currentTags: TagData[];
  allTags: TagData[];
  onChanged: () => void;
};

export function TagInput({
  challengeId,
  workspaceId,
  currentTags,
  allTags,
  onChanged,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<{ id: string; name: string }[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const currentIds = new Set(currentTags.map((t) => t.id));

  // Fetch AI suggestions when challenge has no tags
  useEffect(() => {
    if (currentTags.length > 0) {
      setSuggestedTags([]);
      return;
    }
    let cancelled = false;
    setLoadingSuggestions(true);
    api<{ id: string; name: string }[]>(
      `/api/challenges/${challengeId}/suggest-tags`
    ).then((tags) => {
      if (!cancelled) {
        setSuggestedTags(tags.filter((t) => !currentIds.has(t.id)));
        setLoadingSuggestions(false);
      }
    }).catch(() => {
      if (!cancelled) setLoadingSuggestions(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, currentTags.length]);

  // Available tags = all tags not already on this challenge
  const availableTags = allTags.filter((t) => !currentIds.has(t.id));

  // Filtered by input text
  const filtered = input.trim()
    ? availableTags.filter((t) =>
        t.name.toLowerCase().includes(input.toLowerCase())
      )
    : [];

  const isNewTag = input.trim() && !allTags.some(
    (t) => t.name.toLowerCase() === input.trim().toLowerCase()
  );

  async function addTag(tagName: string) {
    setAdding(true);
    await api(`/api/challenges/${challengeId}/tags`, {
      method: "POST",
      body: JSON.stringify({ tagName, workspaceId }),
    });
    setInput("");
    setAdding(false);
    onChanged();
  }

  async function removeTag(tagId: string) {
    await api(`/api/challenges/${challengeId}/tags`, {
      method: "DELETE",
      body: JSON.stringify({ tagId }),
    });
    onChanged();
  }

  return (
    <div className="space-y-1.5">
      {/* Current tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        {currentTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--color-mint-400)]/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-green-900)]"
          >
            {tag.name}
            <button
              className="ml-0.5 text-[var(--color-stone-700)] hover:text-red-500"
              onClick={() => removeTag(tag.id)}
              type="button"
            >
              x
            </button>
          </span>
        ))}
      </div>

      {/* Suggested tags (only when challenge has no tags) */}
      {currentTags.length === 0 && suggestedTags.length > 0 && !loadingSuggestions && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--color-stone-700)]">
            Förslag:
          </span>
          {suggestedTags.map((tag) => (
            <button
              key={tag.id}
              className="rounded-full border border-dashed border-[var(--color-mint-400)]/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-mint-400)]/80 transition hover:bg-[var(--color-mint-400)]/10 hover:text-[var(--color-green-900)]"
              onClick={() => addTag(tag.name)}
              disabled={adding}
              type="button"
            >
              + {tag.name}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            className="w-full rounded-full bg-transparent px-2 py-1 text-[10px] outline-none placeholder:text-[var(--color-stone-700)]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                addTag(input.trim());
              }
            }}
            onFocus={() => setShowPicker(true)}
            onBlur={() => setTimeout(() => setShowPicker(false), 200)}
            placeholder="+ tagg"
            disabled={adding}
          />
          {/* Dropdown: matching tags + "create new" */}
          {showPicker && (filtered.length > 0 || isNewTag) && (
            <div className="absolute left-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border border-black/10 bg-white p-1 shadow-lg">
              {filtered.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  className="block w-full rounded px-3 py-1.5 text-left text-[10px] hover:bg-[var(--color-cream-100)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(t.name)}
                  type="button"
                >
                  {t.name}
                </button>
              ))}
              {isNewTag && (
                <button
                  className="block w-full rounded px-3 py-1.5 text-left text-[10px] font-semibold text-[var(--color-mint-400)] hover:bg-[var(--color-cream-100)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(input.trim())}
                  type="button"
                >
                  + Skapa &quot;{input.trim()}&quot;
                </button>
              )}
            </div>
          )}
        </div>

        {/* Quick-pick: show top existing tags as small buttons */}
        {!showPicker && currentTags.length > 0 && availableTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {availableTags.slice(0, 3).map((t) => (
              <button
                key={t.id}
                className="rounded-full border border-black/8 px-2 py-0.5 text-[9px] text-[var(--color-stone-700)] transition hover:bg-[var(--color-cream-100)]"
                onClick={() => addTag(t.name)}
                disabled={adding}
                type="button"
              >
                + {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
