"use client";

import { useState } from "react";
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

  const availableTags = allTags.filter(
    (t) => !currentTags.some((ct) => ct.id === t.id)
  );
  const filtered = input.trim()
    ? availableTags.filter((t) =>
        t.name.toLowerCase().includes(input.toLowerCase())
      )
    : [];

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
      <div className="relative">
        <input
          className="w-20 rounded-full bg-transparent px-2 py-1 text-[10px] outline-none placeholder:text-[var(--color-stone-700)]"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              addTag(input.trim());
            }
          }}
          placeholder="+ tagg"
          disabled={adding}
        />
        {filtered.length > 0 && (
          <div className="absolute left-0 top-full z-10 mt-1 rounded-lg border border-black/10 bg-white p-1 shadow-lg">
            {filtered.slice(0, 5).map((t) => (
              <button
                key={t.id}
                className="block w-full rounded px-3 py-1.5 text-left text-[10px] hover:bg-[var(--color-cream-100)]"
                onClick={() => addTag(t.name)}
                type="button"
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
