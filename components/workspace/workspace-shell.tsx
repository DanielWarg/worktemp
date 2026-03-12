"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PersonData, TagData, WorkspaceData } from "./types";
import { api, TEAM_COLORS } from "./helpers";
import { CanvasView } from "./canvas-view";
import { PersonDetailPanel } from "./person-detail-panel";
import { MeetingCaptureView } from "./meeting-capture-view";
import { PatternView } from "./pattern-view";
import { HistoricalImportDialog } from "./historical-import-dialog";
import { CrmSettingsView } from "./crm-settings-view";
import { MeetingHistoryView } from "./meeting-history-view";

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

function useWorkspaceLoader(workspaceId: string) {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const data = await api<WorkspaceData>(`/api/workspaces/${workspaceId}`);
    setWorkspace(data);
    return data;
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    api<WorkspaceData>(`/api/workspaces/${workspaceId}`).then((data) => {
      if (!cancelled) {
        setWorkspace(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [workspaceId]);

  return { workspace, loading, reload };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

type ViewMode = "canvas" | "meeting" | "patterns" | "crm" | "history";

export function WorkspaceShell({ workspaceId }: { workspaceId: string }) {
  const { workspace, loading, reload } = useWorkspaceLoader(workspaceId);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newPeopleByTeam, setNewPeopleByTeam] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [showImport, setShowImport] = useState(false);
  const [allTags, setAllTags] = useState<TagData[]>([]);

  /* -- Derived state ------------------------------------------------- */

  const teams = useMemo(() => workspace?.teams ?? [], [workspace]);

  const allPeople = useMemo(
    () => teams.flatMap((t) => t.memberships.map((m) => ({ ...m.person, teamId: t.id }))),
    [teams]
  );

  const selectedPerson = useMemo(
    () => allPeople.find((p) => p.id === selectedPersonId) ?? null,
    [allPeople, selectedPersonId]
  );

  const selectedTeam = useMemo(
    () => teams.find((t) => t.memberships.some((m) => m.personId === selectedPersonId)) ?? null,
    [teams, selectedPersonId]
  );

  // Load tags for the workspace
  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    api<TagData[]>(`/api/tags?workspaceId=${workspace.id}`).then((data) => {
      if (!cancelled) setAllTags(data);
    });
    return () => { cancelled = true; };
  }, [workspace]);

  /* -- Handlers ------------------------------------------------------ */

  async function handleCreateTeam() {
    const name = newTeamName.trim();
    if (!name || !workspace) return;

    setSaving(true);
    await api("/api/teams", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: workspace.id,
        name,
        color: TEAM_COLORS[teams.length % TEAM_COLORS.length],
      }),
    });
    setNewTeamName("");
    await reload();
    setSaving(false);
  }

  async function handleTeamNameChange(teamId: string, value: string) {
    await api(`/api/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: value || "Namnlöst team" }),
    });
  }

  async function handleDeleteTeam(teamId: string) {
    setSaving(true);
    await api(`/api/teams/${teamId}`, { method: "DELETE" });
    if (selectedTeam?.id === teamId) setSelectedPersonId(null);
    await reload();
    setSaving(false);
  }

  function handlePersonDraftChange(teamId: string, value: string) {
    setNewPeopleByTeam((c) => ({ ...c, [teamId]: value }));
  }

  async function handleCreatePerson(teamId: string) {
    const name = (newPeopleByTeam[teamId] ?? "").trim();
    if (!name || !workspace) return;

    setSaving(true);
    const person = await api<PersonData>("/api/persons", {
      method: "POST",
      body: JSON.stringify({ workspaceId: workspace.id, teamId, name }),
    });
    setNewPeopleByTeam((c) => ({ ...c, [teamId]: "" }));
    setSelectedPersonId(person.id);
    await reload();
    setSaving(false);
  }

  async function handleUpdatePerson(field: string, value: string) {
    if (!selectedPerson) return;
    await api(`/api/persons/${selectedPerson.id}`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: value }),
    });
    await reload();
  }

  async function handleAddNote(content: string) {
    if (!selectedPerson) return;
    setSaving(true);
    await api(`/api/persons/${selectedPerson.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    await reload();
    setSaving(false);
  }

  async function handleMoveSelectedPerson(targetTeamId: string) {
    if (!selectedPerson || !selectedTeam || selectedTeam.id === targetTeamId) return;

    setSaving(true);
    await api(`/api/persons/${selectedPerson.id}/move`, {
      method: "POST",
      body: JSON.stringify({ fromTeamId: selectedTeam.id, toTeamId: targetTeamId }),
    });
    await reload();
    setSaving(false);
  }

  async function handleDeleteSelectedPerson() {
    if (!selectedPerson) return;

    setSaving(true);
    await api(`/api/persons/${selectedPerson.id}`, { method: "DELETE" });
    setSelectedPersonId(null);
    await reload();
    setSaving(false);
  }

  async function handleReload() {
    await reload();
    if (workspace) {
      api<TagData[]>(`/api/tags?workspaceId=${workspace.id}`).then(setAllTags);
    }
  }

  /* -- Meeting mode -------------------------------------------------- */

  if (viewMode === "meeting" && workspace) {
    return (
      <MeetingCaptureView
        workspaceId={workspace.id}
        teams={teams}
        allPeople={allPeople}
        onEnd={async () => {
          setViewMode("canvas");
          await reload();
        }}
      />
    );
  }

  /* -- Pattern mode -------------------------------------------------- */

  if (viewMode === "patterns" && workspace) {
    return (
      <PatternView
        workspaceId={workspace.id}
        onBack={() => setViewMode("canvas")}
      />
    );
  }

  /* -- CRM mode ------------------------------------------------------ */

  if (viewMode === "crm" && workspace) {
    return (
      <CrmSettingsView
        workspaceId={workspace.id}
        onBack={() => setViewMode("canvas")}
      />
    );
  }

  /* -- History mode -------------------------------------------------- */

  if (viewMode === "history" && workspace) {
    return (
      <MeetingHistoryView
        workspaceId={workspace.id}
        onBack={() => setViewMode("canvas")}
      />
    );
  }

  /* -- Loading ------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-green-950)] text-[var(--color-cream-50)]">
        <p className="animate-pulse font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
          Laddar arbetsyta...
        </p>
      </div>
    );
  }

  /* -- Canvas mode --------------------------------------------------- */

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(91,191,160,0.14),transparent_28%),linear-gradient(180deg,#102a24_0%,#0c211c_48%,#07110f_100%)] text-[var(--color-cream-50)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 md:px-6">
        {/* Header */}
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/6 px-5 py-5 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
              Workspace
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {workspace?.name ?? "Arbetsyta"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-cream-100)]/72">
              Fånga utmaningar i möten, se mönster och agera på insikter.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-full border border-[var(--color-mint-400)]/30 bg-[var(--color-mint-400)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--color-mint-300)] transition hover:bg-[var(--color-mint-400)]/20"
              onClick={() => setViewMode("meeting")}
              type="button"
            >
              Starta möte
            </button>
            <button
              className="rounded-full border border-[var(--color-copper-400)]/30 bg-[var(--color-copper-400)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--color-copper-400)] transition hover:bg-[var(--color-copper-400)]/20"
              onClick={() => setViewMode("patterns")}
              type="button"
            >
              Mönster
            </button>
            <button
              className="rounded-full border border-[var(--color-sky-400)]/30 bg-[var(--color-sky-400)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--color-sky-400)] transition hover:bg-[var(--color-sky-400)]/20"
              onClick={() => setViewMode("crm")}
              type="button"
            >
              CRM
            </button>
            <button
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
              onClick={() => setShowImport(true)}
              type="button"
            >
              Importera
            </button>
            <button
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
              onClick={() => setViewMode("history")}
              type="button"
            >
              Historik
            </button>
            <div className="flex min-w-[280px] items-center gap-2 rounded-full border border-white/12 bg-black/10 p-1">
              <input
                className="w-full bg-transparent px-4 py-2 text-sm text-white outline-none placeholder:text-white/40"
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateTeam()}
                placeholder="Namn på nytt team"
                value={newTeamName}
              />
              <button
                className="rounded-full bg-[var(--color-mint-400)] px-4 py-2 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-50"
                disabled={saving}
                onClick={handleCreateTeam}
                type="button"
              >
                + Lägg till team
              </button>
            </div>
            {saving && (
              <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/75">
                Sparar...
              </span>
            )}
          </div>
        </header>

        {/* Main grid */}
        <div className="mt-4 grid flex-1 gap-4 xl:grid-cols-[1fr_420px]">
          <CanvasView
            teams={teams}
            selectedPersonId={selectedPersonId}
            onSelectPerson={setSelectedPersonId}
            onTeamNameChange={handleTeamNameChange}
            onDeleteTeam={handleDeleteTeam}
            onCreatePerson={handleCreatePerson}
            newPeopleByTeam={newPeopleByTeam}
            onPersonDraftChange={handlePersonDraftChange}
            saving={saving}
          />

          {selectedPerson ? (
            <PersonDetailPanel
              person={selectedPerson}
              team={selectedTeam}
              teams={teams}
              workspaceId={workspaceId}
              saving={saving}
              allTags={allTags}
              onUpdatePerson={handleUpdatePerson}
              onMovePerson={handleMoveSelectedPerson}
              onDeletePerson={handleDeleteSelectedPerson}
              onAddNote={handleAddNote}
              onReload={handleReload}
            />
          ) : (
            <PersonDetailPanel.Empty />
          )}
        </div>
      </div>

      {/* Historical Import Dialog */}
      {showImport && (
        <HistoricalImportDialog
          workspaceId={workspaceId}
          people={allPeople}
          onClose={() => setShowImport(false)}
          onImported={() => reload()}
        />
      )}
    </div>
  );
}
