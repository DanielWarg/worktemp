"use client";

import { useState } from "react";
import { PersonData, TeamData, ChallengeData, TagData } from "./types";
import { initialsFromName, formatDate, formatFileSize, api } from "./helpers";
import { TagInput } from "./tag-input";

type PersonDetailPanelProps = {
  person: PersonData;
  team: TeamData | null;
  teams: TeamData[];
  workspaceId: string;
  saving: boolean;
  allTags?: TagData[];
  onUpdatePerson: (field: string, value: string) => void;
  onMovePerson: (targetTeamId: string) => void;
  onDeletePerson: () => void;
  onAddNote: (content: string) => Promise<void>;
  onReload: () => Promise<void>;
};

type PanelTab = "profil" | "utmaningar";

export function PersonDetailPanel({
  person,
  team,
  teams,
  workspaceId,
  saving,
  allTags = [],
  onUpdatePerson,
  onMovePerson,
  onDeletePerson,
  onAddNote,
  onReload,
}: PersonDetailPanelProps) {
  const [draftNote, setDraftNote] = useState("");
  const [activeTab, setActiveTab] = useState<PanelTab>("profil");

  const openChallenges = person.challenges?.filter((c) => c.status === "OPEN") ?? [];
  const resolvedChallenges = person.challenges?.filter((c) => c.status !== "OPEN") ?? [];

  async function handleAddNote() {
    const content = draftNote.trim();
    if (!content) return;
    await onAddNote(content);
    setDraftNote("");
  }

  async function handleAddChallenge(content: string) {
    await api("/api/challenges", {
      method: "POST",
      body: JSON.stringify({
        personId: person.id,
        workspaceId,
        contentRaw: content,
        sourceType: "BETWEEN_MEETINGS",
      }),
    });
    await onReload();
  }

  async function handleUpdateChallengeStatus(challengeId: string, status: string) {
    await api(`/api/challenges/${challengeId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await onReload();
  }

  return (
    <aside className="rounded-[2rem] border border-white/10 bg-[var(--color-cream-50)] text-[var(--color-green-950)] shadow-[0_30px_100px_rgba(0,0,0,0.26)]">
      {/* Header */}
      <div className="border-b border-black/8 px-6 py-5">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--color-copper-500)]">
          Persondetalj
        </p>
        <div className="mt-4 flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-green-900)] text-sm font-semibold text-[var(--color-mint-300)]">
            {initialsFromName(person.name)}
          </div>
          <div className="flex-1">
            <input
              className="w-full bg-transparent text-xl font-semibold outline-none"
              defaultValue={person.name}
              key={`name-${person.id}`}
              onBlur={(e) => onUpdatePerson("name", e.target.value)}
            />
            <input
              className="mt-1 w-full bg-transparent text-sm text-[var(--color-stone-700)] outline-none"
              defaultValue={person.roleTitle ?? ""}
              key={`role-${person.id}`}
              onBlur={(e) => onUpdatePerson("roleTitle", e.target.value)}
            />
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--color-stone-700)]">
          Tillhör just nu teamet{" "}
          <span className="font-semibold text-[var(--color-green-900)]">
            {team?.name ?? "Okänt team"}
          </span>
          .
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--color-stone-700)]">
            Flytta till
            <select
              className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs normal-case tracking-normal text-[var(--color-green-950)] outline-none"
              onChange={(e) => onMovePerson(e.target.value)}
              value={team?.id ?? ""}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-full border border-[var(--color-copper-500)]/25 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-copper-500)] transition hover:bg-[var(--color-copper-500)]/8"
            onClick={onDeletePerson}
            type="button"
          >
            Ta bort person
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-black/8">
        <button
          className={`flex-1 px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition ${
            activeTab === "profil"
              ? "border-b-2 border-[var(--color-mint-400)] text-[var(--color-green-950)]"
              : "text-[var(--color-stone-700)] hover:text-[var(--color-green-900)]"
          }`}
          onClick={() => setActiveTab("profil")}
          type="button"
        >
          Profil
        </button>
        <button
          className={`flex-1 px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition ${
            activeTab === "utmaningar"
              ? "border-b-2 border-[var(--color-mint-400)] text-[var(--color-green-950)]"
              : "text-[var(--color-stone-700)] hover:text-[var(--color-green-900)]"
          }`}
          onClick={() => setActiveTab("utmaningar")}
          type="button"
        >
          Utmaningar
          {openChallenges.length > 0 && (
            <span className="ml-2 rounded-full bg-[var(--color-copper-500)]/15 px-2 py-0.5 text-[10px] text-[var(--color-copper-500)]">
              {openChallenges.length}
            </span>
          )}
        </button>
      </div>

      <div className="grid gap-5 px-6 py-5">
        {activeTab === "profil" && (
          <>
            {/* Basic info */}
            <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                Grundinfo
              </p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--color-stone-700)]">
                    Roll
                  </span>
                  <input
                    className="rounded-2xl bg-[var(--color-cream-100)] px-4 py-3 text-sm outline-none ring-0"
                    defaultValue={person.roleTitle ?? ""}
                    key={`role-field-${person.id}`}
                    onBlur={(e) => onUpdatePerson("roleTitle", e.target.value)}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--color-stone-700)]">
                    Ansvar och sammanhang
                  </span>
                  <textarea
                    className="min-h-28 rounded-2xl bg-[var(--color-cream-100)] px-4 py-3 text-sm leading-6 outline-none"
                    defaultValue={person.summaryText ?? ""}
                    key={`summary-${person.id}`}
                    onBlur={(e) => onUpdatePerson("summaryText", e.target.value)}
                  />
                </label>
              </div>
            </section>

            {/* Notes */}
            <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                Anteckningar
              </p>
              <div className="mt-4 grid gap-3">
                <textarea
                  className="min-h-24 rounded-2xl bg-[var(--color-cream-100)] px-4 py-3 text-sm leading-6 outline-none"
                  onChange={(e) => setDraftNote(e.target.value)}
                  placeholder="Skriv en ny anteckning om personen"
                  value={draftNote}
                />
                <button
                  className="justify-self-start rounded-full bg-[var(--color-green-900)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-green-800)] disabled:opacity-50"
                  disabled={saving}
                  onClick={handleAddNote}
                  type="button"
                >
                  Lägg till anteckning
                </button>

                {person.notes.length > 0 ? (
                  person.notes.map((note) => (
                    <article key={note.id} className="rounded-2xl bg-[var(--color-cream-100)] p-3">
                      <p className="text-sm leading-6">{note.contentRaw}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--color-stone-700)]">
                        {formatDate(note.createdAt)}
                      </p>
                    </article>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-black/10 p-4 text-sm text-[var(--color-stone-700)]">
                    Inga anteckningar ännu.
                  </div>
                )}
              </div>
            </section>

            {/* Files */}
            <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                Filer
              </p>
              <div className="mt-4 grid gap-3">
                {person.attachments.length > 0 ? (
                  person.attachments.map((att) => (
                    <article key={att.id} className="rounded-2xl bg-[var(--color-cream-100)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{att.fileName}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--color-stone-700)]">
                            {att.mimeType.split("/")[1]?.toUpperCase() ?? "FIL"} &bull;{" "}
                            {formatFileSize(att.fileSize)}
                          </p>
                        </div>
                      </div>
                      {att.comments.length > 0 && (
                        <div className="mt-2 border-t border-black/5 pt-2">
                          {att.comments.map((c) => (
                            <p
                              key={c.id}
                              className="text-sm leading-6 text-[var(--color-stone-700)]"
                            >
                              {c.contentRaw}
                            </p>
                          ))}
                        </div>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-black/10 p-4 text-sm text-[var(--color-stone-700)]">
                    Här kommer dokument och filer kunna kopplas till personen. Filuppladdning kommer i nästa steg.
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === "utmaningar" && (
          <>
            <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                Ny utmaning
              </p>
              <div className="mt-3">
                <ChallengeInputInPanel onSubmit={handleAddChallenge} />
              </div>
            </section>

            {openChallenges.length > 0 && (
              <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                  Öppna ({openChallenges.length})
                </p>
                <div className="mt-3 grid gap-2">
                  {openChallenges.map((c) => (
                    <ChallengeItem
                      key={c.id}
                      challenge={c}
                      workspaceId={workspaceId}
                      allTags={allTags}
                      onUpdateStatus={handleUpdateChallengeStatus}
                      onReload={onReload}
                    />
                  ))}
                </div>
              </section>
            )}

            {resolvedChallenges.length > 0 && (
              <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-stone-700)]">
                  Hanterade ({resolvedChallenges.length})
                </p>
                <div className="mt-3 grid gap-2">
                  {resolvedChallenges.map((c) => (
                    <ChallengeItem
                      key={c.id}
                      challenge={c}
                      workspaceId={workspaceId}
                      allTags={allTags}
                      onUpdateStatus={handleUpdateChallengeStatus}
                      onReload={onReload}
                    />
                  ))}
                </div>
              </section>
            )}

            {openChallenges.length === 0 && resolvedChallenges.length === 0 && (
              <div className="rounded-2xl border border-dashed border-black/10 p-4 text-sm text-[var(--color-stone-700)]">
                Inga utmaningar registrerade ännu. Fånga utmaningar i ett möte eller lägg till direkt ovan.
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function ChallengeInputInPanel({ onSubmit }: { onSubmit: (content: string) => Promise<void> }) {
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
        className="flex-1 rounded-2xl bg-[var(--color-cream-100)] px-4 py-3 text-sm outline-none"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="Beskriv utmaningen..."
        disabled={submitting}
        autoComplete="off"
      />
      <button
        className="rounded-full bg-[var(--color-green-900)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-green-800)] disabled:opacity-50"
        onClick={handleSubmit}
        disabled={submitting || !content.trim()}
        type="button"
      >
        Lägg till
      </button>
    </div>
  );
}

function ChallengeItem({
  challenge,
  workspaceId,
  allTags,
  onUpdateStatus,
  onReload,
}: {
  challenge: ChallengeData;
  workspaceId: string;
  allTags: TagData[];
  onUpdateStatus: (id: string, status: string) => void;
  onReload: () => Promise<void>;
}) {
  const isOpen = challenge.status === "OPEN";
  const currentTags = challenge.tags?.map((ct) => ct.tag) ?? [];

  return (
    <div className="rounded-2xl bg-[var(--color-cream-100)] p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className={`text-sm leading-6 ${!isOpen ? "line-through opacity-60" : ""}`}>
            {challenge.contentRaw}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-stone-700)]">
              {formatDate(challenge.createdAt)}
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-stone-700)]">
              {challenge.sourceType === "MEETING" ? "Möte" : challenge.sourceType === "BETWEEN_MEETINGS" ? "Mellan möten" : challenge.sourceType === "HISTORICAL" ? "Historisk" : challenge.sourceType}
            </span>
          </div>
        </div>
        {isOpen ? (
          <button
            className="shrink-0 rounded-full border border-black/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-stone-700)] transition hover:bg-black/5"
            onClick={() => onUpdateStatus(challenge.id, "RESOLVED")}
            type="button"
          >
            Lös
          </button>
        ) : (
          <button
            className="shrink-0 rounded-full border border-black/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-stone-700)] transition hover:bg-black/5"
            onClick={() => onUpdateStatus(challenge.id, "OPEN")}
            type="button"
          >
            Öppna
          </button>
        )}
      </div>
      <div className="mt-2">
        <TagInput
          challengeId={challenge.id}
          workspaceId={workspaceId}
          currentTags={currentTags}
          allTags={allTags}
          onChanged={onReload}
        />
      </div>
    </div>
  );
}

function EmptyPanel() {
  return (
    <aside className="rounded-[2rem] border border-white/10 bg-[var(--color-cream-50)] text-[var(--color-green-950)] shadow-[0_30px_100px_rgba(0,0,0,0.26)]">
      <div className="flex h-full min-h-[420px] items-center justify-center p-8">
        <div className="max-w-sm rounded-[1.75rem] border border-dashed border-black/10 bg-white p-6 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
            Ingen person vald
          </p>
          <h2 className="mt-3 text-xl font-semibold text-[var(--color-green-950)]">
            Välj eller skapa ett personkort
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-stone-700)]">
            När ett kort väljs kan du direkt beskriva roll, ansvar, nuläge och viktiga anteckningar här.
          </p>
        </div>
      </div>
    </aside>
  );
}

PersonDetailPanel.Empty = EmptyPanel;
