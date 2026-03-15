"use client";

import { PersonData } from "./types";
import { initialsFromName, stalenessLabel } from "./helpers";

type PersonCardProps = {
  person: PersonData;
  isSelected: boolean;
  onClick: () => void;
};

export function PersonCard({ person, isSelected, onClick }: PersonCardProps) {
  const staleness = stalenessLabel(person.lastActiveAt);
  const challengeCount = person._count?.challenges ?? person.challenges?.filter((c) => c.status === "OPEN").length ?? 0;

  return (
    <button
      className={`rounded-[1.35rem] p-4 text-left transition ${
        isSelected
          ? "bg-[var(--color-surface-card)] text-[var(--color-green-950)] shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
          : `border border-white/10 bg-white/5 text-white hover:-translate-y-0.5 hover:bg-white/10${
              staleness ? " opacity-60" : ""
            }`
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-green-900)] text-sm font-semibold text-[var(--color-mint-300)]">
          {initialsFromName(person.name)}
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] opacity-50">
          {challengeCount > 0 && (
            <span className="rounded-full bg-[var(--color-copper-500)]/20 px-2 py-0.5 text-[var(--color-copper-400)] opacity-100">
              {challengeCount} utmaning{challengeCount > 1 ? "ar" : ""}
            </span>
          )}
          {person.notes.length > 0 && <span>{person.notes.length} ant.</span>}
          {person.attachments.length > 0 && <span>{person.attachments.length} filer</span>}
        </div>
      </div>
      <p className="mt-4 text-base font-semibold">{person.name}</p>
      <p
        className={`mt-1 text-sm ${
          isSelected ? "text-[var(--color-stone-700)]" : "text-[var(--color-cream-100)]/68"
        }`}
      >
        {person.roleTitle ?? "Ange roll"}
      </p>
      {staleness && (
        <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--color-copper-400)]">
          {staleness}
        </p>
      )}
      <div
        className={`mt-4 h-1.5 rounded-full ${
          isSelected ? "bg-[var(--color-mint-400)]/70" : "bg-white/10"
        }`}
      />
    </button>
  );
}
