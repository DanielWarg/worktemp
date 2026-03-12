"use client";

import { TeamData } from "./types";
import { TeamCard } from "./team-card";

type CanvasViewProps = {
  teams: TeamData[];
  selectedPersonId: string | null;
  onSelectPerson: (id: string) => void;
  onTeamNameChange: (teamId: string, value: string) => void;
  onDeleteTeam: (teamId: string) => void;
  onCreatePerson: (teamId: string) => void;
  newPeopleByTeam: Record<string, string>;
  onPersonDraftChange: (teamId: string, value: string) => void;
  saving: boolean;
};

export function CanvasView({
  teams,
  selectedPersonId,
  onSelectPerson,
  onTeamNameChange,
  onDeleteTeam,
  onCreatePerson,
  newPeopleByTeam,
  onPersonDraftChange,
  saving,
}: CanvasViewProps) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))]">
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:18px_18px] opacity-35" />

      <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-mint-300)]">
            Canvas
          </p>
          <p className="mt-2 text-sm text-[var(--color-cream-100)]/68">
            Se teamen sida vid sida, klicka på ett personkort och fyll på med ansvar, anteckningar och underlag.
          </p>
        </div>
      </div>

      <div className="relative grid gap-5 p-5 xl:grid-cols-2">
        {teams.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/14 bg-black/8 p-12 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-mint-300)]">
              Tomt ännu
            </p>
            <p className="mt-3 max-w-sm text-sm text-[var(--color-cream-100)]/66">
              Skapa ditt första team ovan för att börja bygga din teamstruktur.
            </p>
          </div>
        )}

        {teams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            selectedPersonId={selectedPersonId}
            onSelectPerson={onSelectPerson}
            onTeamNameChange={onTeamNameChange}
            onDeleteTeam={onDeleteTeam}
            onCreatePerson={onCreatePerson}
            personDraft={newPeopleByTeam[team.id] ?? ""}
            onPersonDraftChange={onPersonDraftChange}
            saving={saving}
          />
        ))}
      </div>
    </section>
  );
}
