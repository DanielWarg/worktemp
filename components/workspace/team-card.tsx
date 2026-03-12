"use client";

import { TeamData } from "./types";
import { colorToCssClass } from "./helpers";
import { PersonCard } from "./person-card";

type TeamCardProps = {
  team: TeamData;
  selectedPersonId: string | null;
  onSelectPerson: (id: string) => void;
  onTeamNameChange: (teamId: string, value: string) => void;
  onDeleteTeam: (teamId: string) => void;
  onCreatePerson: (teamId: string) => void;
  personDraft: string;
  onPersonDraftChange: (teamId: string, value: string) => void;
  saving: boolean;
};

export function TeamCard({
  team,
  selectedPersonId,
  onSelectPerson,
  onTeamNameChange,
  onDeleteTeam,
  onCreatePerson,
  personDraft,
  onPersonDraftChange,
  saving,
}: TeamCardProps) {
  return (
    <article className="rounded-[1.75rem] border border-white/10 bg-[rgba(255,255,255,0.07)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 items-start gap-3">
          <span className={`mt-3 h-3 w-3 rounded-full ${colorToCssClass(team.color)}`} />
          <div className="flex-1">
            <input
              className="w-full bg-transparent text-base font-semibold text-white outline-none placeholder:text-white/45"
              defaultValue={team.name}
              key={`team-name-${team.id}-${team.name}`}
              onBlur={(e) => onTeamNameChange(team.id, e.target.value)}
            />
            <p className="mt-1 text-sm text-[var(--color-cream-100)]/62">
              {team.memberships.length} personer
            </p>
          </div>
        </div>
        <button
          className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/50 transition hover:border-red-400/40 hover:text-red-300"
          onClick={() => onDeleteTeam(team.id)}
          title="Ta bort team"
          type="button"
        >
          Ta bort
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-[1.2rem] border border-white/10 bg-black/10 p-2">
        <input
          className="w-full bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
          onChange={(e) => onPersonDraftChange(team.id, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreatePerson(team.id)}
          placeholder="Namn på ny person"
          value={personDraft}
          disabled={saving}
        />
        <button
          className="rounded-full border border-white/10 px-3 py-2 text-xs text-[var(--color-cream-100)]/85 transition hover:bg-white/8"
          onClick={() => onCreatePerson(team.id)}
          type="button"
        >
          + Person
        </button>
      </div>

      {team.memberships.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {team.memberships.map((m) => (
            <PersonCard
              key={m.person.id}
              person={m.person}
              isSelected={m.person.id === selectedPersonId}
              onClick={() => onSelectPerson(m.person.id)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[1.35rem] border border-dashed border-white/14 bg-black/8 p-5 text-sm text-[var(--color-cream-100)]/66">
          Inga personkort ännu. Lägg till första personen för att börja beskriva ansvar och viktiga noter.
        </div>
      )}
    </article>
  );
}
