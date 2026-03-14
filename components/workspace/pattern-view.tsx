"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PatternData } from "./types";
import { api, formatDate } from "./helpers";
import { HistoricalImportDialog } from "./historical-import-dialog";

type PatternViewProps = {
  workspaceId: string;
  initialSystemContext?: string;
  onBack: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  EMERGING: "Framväxande",
  CONFIRMED: "Bekräftat",
  ADDRESSED: "Adresserat",
  DISMISSED: "Avfärdat",
};

const TYPE_LABELS: Record<string, string> = {
  RECURRING: "Återkommande",
  ESCALATING: "Eskalerande",
  CROSS_PERSON: "Tvärs personer",
  CROSS_TEAM: "Tvärs team",
};

type AiProvider = "anthropic" | "local";
type ProviderStatus = { available: boolean; label: string };

export function PatternView({ workspaceId, initialSystemContext, onBack }: PatternViewProps) {
  const [patterns, setPatterns] = useState<PatternData[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiStep, setAiStep] = useState(0);
  const [aiTotalSteps] = useState(4);
  const [aiStepResult, setAiStepResult] = useState<string | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<AiProvider>("local");
  const [cloudUnlocked, setCloudUnlocked] = useState(false);
  const [showCloudWarning, setShowCloudWarning] = useState(false);
  const [cloudConfirmInput, setCloudConfirmInput] = useState("");
  const [providers, setProviders] = useState<Record<string, ProviderStatus>>({});
  const [systemContext, setSystemContext] = useState(initialSystemContext ?? "");
  const [showContext, setShowContext] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"import" | "tag">("import");
  const [showImport, setShowImport] = useState(false);
  const [imports, setImports] = useState<{ id: string; sourceLabel: string; parsedCount: number; createdAt: string }[]>([]);
  const [showImports, setShowImports] = useState(false);
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadImports = useCallback(async () => {
    const data = await api<{ id: string; sourceLabel: string; parsedCount: number; createdAt: string }[]>(
      `/api/imports?workspaceId=${workspaceId}`
    );
    setImports(data);
  }, [workspaceId]);

  const loadPatterns = useCallback(async () => {
    const data = await api<PatternData[]>(`/api/patterns?workspaceId=${workspaceId}`);
    setPatterns(data);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    api<PatternData[]>(`/api/patterns?workspaceId=${workspaceId}`).then((data) => {
      if (!cancelled) {
        setPatterns(data);
        setLoading(false);
      }
    });
    api<{ providers: Record<string, ProviderStatus> }>("/api/ai/status").then((data) => {
      if (!cancelled) {
        setProviders(data.providers);
        if (data.providers.local?.available) setAiProvider("local");
      }
    });
    api<{ id: string; sourceLabel: string; parsedCount: number; createdAt: string }[]>(
      `/api/imports?workspaceId=${workspaceId}`
    ).then((data) => {
      if (!cancelled) setImports(data);
    });
    return () => { cancelled = true; };
  }, [workspaceId]);

  async function handleDeleteImport(importId: string) {
    setDeletingImportId(importId);
    await api(`/api/imports/${importId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    setDeletingImportId(null);
    await Promise.all([loadPatterns(), loadImports()]);
  }

  const AI_STEPS = [
    { key: "normalize", label: "Normaliserar utmaningar" },
    { key: "tag", label: "Auto-taggar" },
    { key: "patterns", label: "Söker mönster" },
    { key: "suggestions", label: "Genererar förslag" },
  ];

  async function handleAIAnalysis() {
    setAiRunning(true);
    setAiStep(0);
    setAiStepResult(null);
    setAiWarnings([]);
    setAiError(null);
    const collectedWarnings: string[] = [];

    for (let i = 0; i < AI_STEPS.length; i++) {
      setAiStep(i + 1);
      setAiStepResult(null);
      try {
        const result = await api<Record<string, { processed?: number; detected?: number; generated?: number; batches?: number; failedBatches?: number }> & { warnings?: string[]; error?: string }>(
          "/api/ai/analyze",
          {
            method: "POST",
            body: JSON.stringify({ workspaceId, steps: [AI_STEPS[i].key], provider: aiProvider }),
          }
        );

        if (result.error) {
          setAiError(`${AI_STEPS[i].label}: ${result.error}`);
          break;
        }

        if (result.warnings) collectedWarnings.push(...result.warnings);

        const stepData = result[AI_STEPS[i].key];
        if (stepData) {
          const count = stepData.processed ?? stepData.detected ?? stepData.generated ?? 0;
          const batchInfo = stepData.batches && stepData.batches > 1 ? ` (${stepData.batches} batchar)` : "";
          const failInfo = stepData.failedBatches ? ` — ${stepData.failedBatches} misslyckade` : "";
          setAiStepResult(`${count} st${batchInfo}${failInfo}`);
        }
      } catch {
        setAiError(`${AI_STEPS[i].label}: Nätverksfel eller servern svarar inte`);
        break;
      }
    }

    if (collectedWarnings.length > 0) setAiWarnings(collectedWarnings);
    await loadPatterns();
    setAiRunning(false);
    setAiStep(0);
    setAiStepResult(null);
  }

  function handleSuggestionStatus(suggestionId: string, status: string) {
    // Optimistic update
    setPatterns((prev) =>
      prev.map((p) => ({
        ...p,
        suggestions: p.suggestions.map((s) =>
          s.id === suggestionId ? { ...s, status } : s
        ),
      }))
    );
    api(`/api/suggestions/${suggestionId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  function handleUpdateStatus(patternId: string, status: string) {
    // Optimistic update
    setPatterns((prev) =>
      prev.map((p) => (p.id === patternId ? { ...p, status } : p))
    );
    api(`/api/patterns/${patternId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  async function handleDelete(patternId: string) {
    // Optimistic update
    setPatterns((prev) => prev.filter((p) => p.id !== patternId));
    if (selectedPatternId === patternId) setSelectedPatternId(null);
    await api(`/api/patterns/${patternId}`, { method: "DELETE" });
  }

  // Group patterns by their primary import (most common importId among linked challenges)
  const groupedPatterns = useMemo(() => {
    type ImportGroup = {
      importId: string | null;
      label: string;
      date: string | null;
      patterns: PatternData[];
    };

    const groups = new Map<string, ImportGroup>();

    for (const pattern of patterns) {
      // Count importIds across this pattern's challenges
      const importCounts = new Map<string, { count: number; label: string; date: string }>();
      let noImportCount = 0;

      for (const pc of pattern.patternChallenges) {
        const imp = pc.challenge.import;
        if (imp) {
          const existing = importCounts.get(imp.id);
          if (existing) {
            existing.count++;
          } else {
            importCounts.set(imp.id, { count: 1, label: imp.sourceLabel, date: imp.createdAt });
          }
        } else {
          noImportCount++;
        }
      }

      // Pick the most common import
      let bestImportId: string | null = null;
      let bestLabel = "Möten & manuellt";
      let bestDate: string | null = null;
      let bestCount = noImportCount;

      for (const [id, info] of importCounts) {
        if (info.count > bestCount) {
          bestCount = info.count;
          bestImportId = id;
          bestLabel = info.label;
          bestDate = info.date;
        }
      }

      const key = bestImportId ?? "__no_import__";
      const group = groups.get(key);
      if (group) {
        group.patterns.push(pattern);
      } else {
        groups.set(key, {
          importId: bestImportId,
          label: bestLabel,
          date: bestDate,
          patterns: [pattern],
        });
      }
    }

    // Sort: imports with dates newest first, "no import" last
    return [...groups.values()].sort((a, b) => {
      if (!a.importId) return 1;
      if (!b.importId) return -1;
      if (a.date && b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();
      return 0;
    });
  }, [patterns]);

  // Group patterns by their primary tag (most common tag among linked challenges)
  const tagGroupedPatterns = useMemo(() => {
    type TagGroup = {
      tagName: string | null;
      patterns: PatternData[];
    };

    const groups = new Map<string, TagGroup>();

    for (const pattern of patterns) {
      const tagCounts = new Map<string, number>();

      for (const pc of pattern.patternChallenges) {
        for (const ct of pc.challenge.tags ?? []) {
          tagCounts.set(ct.tag.name, (tagCounts.get(ct.tag.name) ?? 0) + 1);
        }
      }

      let bestTag: string | null = null;
      let bestCount = 0;
      for (const [name, count] of tagCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestTag = name;
        }
      }

      const key = bestTag ?? "__untagged__";
      const group = groups.get(key);
      if (group) {
        group.patterns.push(pattern);
      } else {
        groups.set(key, { tagName: bestTag, patterns: [pattern] });
      }
    }

    // Sort: tagged groups alphabetically, untagged last
    return [...groups.values()].sort((a, b) => {
      if (!a.tagName) return 1;
      if (!b.tagName) return -1;
      return a.tagName.localeCompare(b.tagName, "sv");
    });
  }, [patterns]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedPattern = patterns.find((p) => p.id === selectedPatternId);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-green-950)]">
        <p className="animate-pulse font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
          Laddar mönster...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(91,191,160,0.14),transparent_28%),linear-gradient(180deg,#102a24_0%,#0c211c_48%,#07110f_100%)] text-[var(--color-cream-50)]">
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6">
        {/* Header */}
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/6 px-5 py-5 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <button
              className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-white/50 transition hover:text-white"
              onClick={onBack}
              type="button"
            >
              &larr; Tillbaka till workspace
            </button>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Mönster
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-cream-100)]/72">
              Mönster som identifierats i teamets utmaningar. Gruppera per import eller tagg.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Provider toggle */}
            <div className="flex items-center rounded-full border border-white/15 p-0.5">
              <button
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide transition ${
                  aiProvider === "local"
                    ? "bg-white/15 text-white"
                    : providers.local?.available
                    ? "text-white/40 hover:text-white/70"
                    : "cursor-not-allowed text-white/20 line-through"
                }`}
                onClick={() => providers.local?.available && setAiProvider("local")}
                disabled={!providers.local?.available || aiRunning}
                title={!providers.local?.available ? "Starta llama-server först" : "Lokal AI — ingen data lämnar datorn"}
                type="button"
              >
                Lokal
                {aiProvider === "local" && providers.local?.available && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-mint-400)]" />
                )}
                {!providers.local?.available && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-copper-500)]" />
                )}
              </button>
              <button
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide transition ${
                  aiProvider === "anthropic"
                    ? "bg-[var(--color-copper-500)]/30 text-[var(--color-copper-400)]"
                    : !providers.anthropic?.available
                    ? "cursor-not-allowed text-white/20 line-through"
                    : cloudUnlocked
                    ? "text-white/40 hover:text-white/70"
                    : "text-white/25 hover:text-white/40"
                }`}
                onClick={() => {
                  if (!providers.anthropic?.available) return;
                  if (!cloudUnlocked) {
                    setShowCloudWarning(true);
                    return;
                  }
                  setAiProvider("anthropic");
                }}
                disabled={!providers.anthropic?.available || aiRunning}
                title={
                  !providers.anthropic?.available
                    ? "ANTHROPIC_API_KEY saknas"
                    : !cloudUnlocked
                    ? "Klicka för att se varningen"
                    : "Data skickas till Anthropic"
                }
                type="button"
              >
                Claude
                {aiProvider === "anthropic" && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-copper-400)]" />
                )}
              </button>
            </div>
            {/* Group-by toggle */}
            <div className="flex items-center rounded-full border border-white/15 p-0.5">
              <button
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide transition ${
                  groupBy === "import" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"
                }`}
                onClick={() => setGroupBy("import")}
                type="button"
              >
                Per import
              </button>
              <button
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide transition ${
                  groupBy === "tag" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"
                }`}
                onClick={() => setGroupBy("tag")}
                type="button"
              >
                Per tagg
              </button>
            </div>
            <button
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
              onClick={() => setShowImport(true)}
              type="button"
            >
              Importera
            </button>
            <button
              className="rounded-full bg-[var(--color-mint-400)] px-5 py-2.5 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-50"
              onClick={handleAIAnalysis}
              disabled={aiRunning}
              type="button"
            >
              {aiRunning
                ? `${aiProvider === "local" ? "Ministral" : "Claude"} analyserar...`
                : "AI-analys"}
            </button>
          </div>
        </header>

        {/* Context — stored on workspace, set at import or here */}
        <div className="mt-3">
          <button
            className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 transition hover:text-white/70"
            onClick={() => setShowContext(!showContext)}
            type="button"
          >
            <span className={`inline-block transition-transform ${showContext ? "rotate-90" : ""}`}>▸</span>
            Datakontext{systemContext && !showContext ? ` — "${systemContext.slice(0, 60)}${systemContext.length > 60 ? "…" : ""}"` : ""}
          </button>
          {showContext && (
            <div className="mt-2">
              <textarea
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-[var(--color-mint-400)]/30 focus:bg-white/8"
                rows={2}
                placeholder='T.ex. "Supportärenden från ett kollektivtrafikföretag som utvecklar realtidssystem"'
                value={systemContext}
                onChange={(e) => setSystemContext(e.target.value)}
              />
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/50 transition hover:bg-white/5 hover:text-white/80 disabled:opacity-50"
                  onClick={async () => {
                    setSavingContext(true);
                    await api(`/api/workspaces/${workspaceId}`, {
                      method: "PATCH",
                      body: JSON.stringify({ systemContext: systemContext.trim() }),
                    });
                    setSavingContext(false);
                  }}
                  disabled={savingContext}
                  type="button"
                >
                  {savingContext ? "Sparar..." : "Spara"}
                </button>
                <p className="text-[10px] text-white/30">
                  Sätts vanligtvis vid import. Används av all AI-analys.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Import management */}
        {imports.length > 0 && (
          <div className="mt-3">
            <button
              className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40 transition hover:text-white/70"
              onClick={() => setShowImports(!showImports)}
              type="button"
            >
              <span className={`inline-block transition-transform ${showImports ? "rotate-90" : ""}`}>▸</span>
              Importer ({imports.length})
            </button>
            {showImports && (
              <div className="mt-2 grid gap-1.5">
                {imports.map((imp) => (
                  <div
                    key={imp.id}
                    className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/80">{imp.sourceLabel}</p>
                      <p className="text-[10px] text-white/35">
                        {imp.parsedCount} ärenden · {formatDate(imp.createdAt)}
                      </p>
                    </div>
                    {confirmDeleteId === imp.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--color-copper-400)]">Radera allt?</span>
                        <button
                          className="rounded-full bg-red-500/20 px-3 py-1 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/30 disabled:opacity-50"
                          onClick={() => handleDeleteImport(imp.id)}
                          disabled={deletingImportId === imp.id}
                          type="button"
                        >
                          {deletingImportId === imp.id ? "Raderar..." : "Ja, radera"}
                        </button>
                        <button
                          className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/50 transition hover:text-white/80"
                          onClick={() => setConfirmDeleteId(null)}
                          type="button"
                        >
                          Avbryt
                        </button>
                      </div>
                    ) : (
                      <button
                        className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/40 transition hover:border-red-500/30 hover:text-red-400"
                        onClick={() => setConfirmDeleteId(imp.id)}
                        type="button"
                      >
                        Ta bort
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="mt-1 rounded-full border border-[var(--color-mint-400)]/20 bg-[var(--color-mint-400)]/5 px-4 py-2 text-[11px] font-semibold text-[var(--color-mint-300)] transition hover:bg-[var(--color-mint-400)]/10 disabled:opacity-50"
                  onClick={handleAIAnalysis}
                  disabled={aiRunning}
                  type="button"
                >
                  {aiRunning ? "Analyserar..." : "Kör AI-analys på all data"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Progress overlay */}
        {aiRunning && (
          <div className="mt-4 rounded-[2rem] border border-[var(--color-mint-400)]/20 bg-white/5 p-6 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-mint-400)] border-t-transparent" />
              <div className="flex-1">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-mint-300)]">
                  {`${aiProvider === "local" ? "Ministral (offline)" : "Claude"} — Steg ${aiStep} av ${aiTotalSteps}: ${AI_STEPS[aiStep - 1]?.label ?? "Förbereder..."}`}
                </p>
                {aiStepResult && (
                  <p className="mt-1 font-mono text-[10px] tracking-wide text-[var(--color-mint-400)]/70">
                    Föregående: {aiStepResult}
                  </p>
                )}
                {aiRunning && (
                  <div className="mt-3 flex gap-1.5">
                    {AI_STEPS.map((step, i) => (
                      <div key={step.key} className="flex-1">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            i + 1 < aiStep
                              ? "bg-[var(--color-mint-400)]"
                              : i + 1 === aiStep
                              ? "animate-pulse bg-[var(--color-mint-400)]/60"
                              : "bg-white/10"
                          }`}
                        />
                        <p className={`mt-1.5 text-[10px] tracking-wide ${
                          i + 1 <= aiStep ? "text-white/70" : "text-white/30"
                        }`}>
                          {step.label}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI error banner */}
        {aiError && !aiRunning && (
          <div className="mt-4 rounded-[2rem] border border-red-500/30 bg-red-500/10 p-5 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-red-400">
                  AI-analys avbröts
                </p>
                <p className="mt-2 text-sm text-red-300">{aiError}</p>
              </div>
              <button
                className="shrink-0 rounded-full border border-red-500/25 px-3 py-1 text-[11px] text-red-400 transition hover:bg-red-500/10"
                onClick={() => setAiError(null)}
                type="button"
              >
                Stäng
              </button>
            </div>
          </div>
        )}

        {/* AI warnings banner */}
        {aiWarnings.length > 0 && !aiRunning && (
          <div className="mt-4 rounded-[2rem] border border-[var(--color-copper-500)]/30 bg-[var(--color-copper-500)]/10 p-5 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-copper-400)]">
                  AI-analys klar med varningar
                </p>
                <ul className="mt-2 space-y-1">
                  {aiWarnings.map((w, i) => (
                    <li key={i} className="text-sm text-[var(--color-copper-400)]/80">
                      {w}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-white/40">
                  Misslyckade batchar hoppades över. Resultaten kan vara ofullständiga.
                </p>
              </div>
              <button
                className="shrink-0 rounded-full border border-[var(--color-copper-500)]/25 px-3 py-1 text-[11px] text-[var(--color-copper-400)] transition hover:bg-[var(--color-copper-500)]/10"
                onClick={() => setAiWarnings([])}
                type="button"
              >
                Stäng
              </button>
            </div>
          </div>
        )}

        {/* Cloud provider warning modal */}
        {showCloudWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-md rounded-[2rem] border border-[var(--color-copper-500)]/30 bg-[var(--color-green-900)] p-6 text-white shadow-2xl">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-copper-400)]">
                Varning: extern AI
              </p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-white/80">
                <p>
                  Om du aktiverar Claude skickas <strong className="text-white">all data i denna workspace</strong> till
                  Anthropics servrar (USA) för analys.
                </p>
                <p>
                  Detta inkluderar utmaningar, personnamn, taggar och annan information som finns
                  i ditt team-radar-konto.
                </p>
                <p>
                  <strong className="text-[var(--color-copper-400)]">
                    Rekommendation: Använd den lokala AI:n (Ministral) som kör helt offline på din dator.
                  </strong>
                </p>
              </div>
              <div className="mt-5">
                <label className="grid gap-2">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-white/50">
                    Skriv JAG FÖRSTÅR för att låsa upp
                  </span>
                  <input
                    className="rounded-xl border border-white/12 bg-black/20 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[var(--color-copper-500)]/40"
                    value={cloudConfirmInput}
                    onChange={(e) => setCloudConfirmInput(e.target.value)}
                    placeholder="JAG FÖRSTÅR"
                    autoFocus
                  />
                </label>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <button
                  className="rounded-full bg-[var(--color-copper-500)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-copper-400)] disabled:opacity-30"
                  disabled={cloudConfirmInput.trim().toUpperCase() !== "JAG FÖRSTÅR"}
                  onClick={() => {
                    setCloudUnlocked(true);
                    setAiProvider("anthropic");
                    setShowCloudWarning(false);
                    setCloudConfirmInput("");
                  }}
                  type="button"
                >
                  Aktivera Claude
                </button>
                <button
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/70 transition hover:bg-white/5"
                  onClick={() => {
                    setShowCloudWarning(false);
                    setCloudConfirmInput("");
                  }}
                  type="button"
                >
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_480px]">
          {/* Pattern list — grouped by import or tag */}
          <div className="flex flex-col gap-3 self-start">
            {patterns.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-white/14 bg-black/8 p-12 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-mint-300)]">
                  Inga mönster ännu
                </p>
                <p className="mt-3 max-w-sm mx-auto text-sm text-[var(--color-cream-100)]/66">
                  Importera utmaningar och kör AI-analys för att hitta mönster.
                </p>
              </div>
            ) : (
              (groupBy === "tag"
                ? tagGroupedPatterns.map((g) => ({
                    key: g.tagName ?? "__untagged__",
                    label: g.tagName ?? "Otaggade",
                    sublabel: `${g.patterns.length} mönster`,
                    patterns: g.patterns,
                  }))
                : groupedPatterns.map((g) => ({
                    key: g.importId ?? "__no_import__",
                    label: g.label,
                    sublabel: `${g.patterns.length} mönster${g.date ? ` · importerad ${formatDate(g.date)}` : ""}`,
                    patterns: g.patterns,
                  }))
              ).map((group) => {
                const isCollapsed = collapsedGroups.has(group.key);
                return (
                  <div key={group.key} className="rounded-[1.5rem] border border-white/8 bg-white/[0.03]">
                    {/* Group header */}
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      onClick={() => toggleGroup(group.key)}
                      type="button"
                    >
                      <span className={`text-[10px] text-white/40 transition-transform ${isCollapsed ? "" : "rotate-90"}`}>
                        ▸
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-mint-300)]">
                          {group.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-white/35">
                          {group.sublabel}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold text-white/50">
                        {group.patterns.reduce((sum, p) => sum + p.patternChallenges.length, 0)} utmaningar
                      </span>
                    </button>

                    {/* Group patterns */}
                    {!isCollapsed && (
                      <div className="flex flex-col gap-1.5 px-2 pb-2">
                        {group.patterns.map((pattern) => (
                          <div
                            key={pattern.id}
                            className={`group/card flex w-full items-center rounded-xl border text-left transition ${
                              pattern.id === selectedPatternId
                                ? "border-[var(--color-mint-400)]/40 bg-white/10"
                                : "border-white/6 bg-white/[0.04] hover:bg-white/8"
                            }`}
                          >
                            <button
                              className="min-w-0 flex-1 px-3.5 py-2.5 text-left"
                              onClick={() => setSelectedPatternId(pattern.id)}
                              type="button"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold text-white truncate">{pattern.title}</h3>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                                    {pattern.occurrenceCount}x
                                  </span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                      pattern.status === "EMERGING"
                                        ? "bg-[var(--color-copper-500)]/20 text-[var(--color-copper-400)]"
                                        : pattern.status === "CONFIRMED"
                                        ? "bg-[var(--color-mint-400)]/20 text-[var(--color-mint-300)]"
                                        : pattern.status === "ADDRESSED"
                                        ? "bg-[var(--color-sky-400)]/20 text-[var(--color-sky-400)]"
                                        : "bg-white/10 text-white/50"
                                    }`}
                                  >
                                    {STATUS_LABELS[pattern.status] ?? pattern.status}
                                  </span>
                                  {pattern.crmEvidence && pattern.crmEvidence.length > 0 && (
                                    <span className="rounded-full bg-[var(--color-sky-400)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sky-400)]">
                                      CRM
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                                  {TYPE_LABELS[pattern.patternType] ?? pattern.patternType}
                                </span>
                                <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                                  {pattern.patternChallenges.length} utmaning{pattern.patternChallenges.length !== 1 ? "ar" : ""}
                                </span>
                              </div>
                            </button>
                            <button
                              className="shrink-0 px-3 py-2.5 text-white/0 transition group-hover/card:text-white/30 hover:!text-red-400"
                              onClick={() => handleDelete(pattern.id)}
                              title="Ta bort mönster"
                              type="button"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pattern detail */}
          {selectedPattern ? (
            <aside className="rounded-[2rem] border border-white/10 bg-[var(--color-cream-50)] text-[var(--color-green-950)] shadow-[0_30px_100px_rgba(0,0,0,0.26)]">
              <div className="border-b border-black/8 px-6 py-5">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--color-copper-500)]">
                  Mönsterdetalj
                </p>
                <h2 className="mt-3 text-xl font-semibold">{selectedPattern.title}</h2>
                {selectedPattern.description && (
                  <p className="mt-2 text-sm text-[var(--color-stone-700)]">
                    {selectedPattern.description}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {(["EMERGING", "CONFIRMED", "ADDRESSED", "DISMISSED"] as const).map(
                    (status) => (
                      <button
                        key={status}
                        className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                          selectedPattern.status === status
                            ? "bg-[var(--color-green-900)] text-white"
                            : "border border-black/10 text-[var(--color-stone-700)] hover:bg-black/5"
                        }`}
                        onClick={() => handleUpdateStatus(selectedPattern.id, status)}
                        type="button"
                      >
                        {STATUS_LABELS[status]}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="grid gap-4 px-6 py-5">
                {/* Suggestions */}
                {selectedPattern.suggestions.length > 0 && (
                  <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                      Förslag ({selectedPattern.suggestions.length})
                    </p>
                    <div className="mt-3 grid gap-2">
                      {selectedPattern.suggestions.map((s) => (
                        <div key={s.id} className="rounded-2xl bg-[var(--color-cream-100)] p-3">
                          <p className={`text-sm leading-6 ${s.status === "DISMISSED" ? "line-through opacity-50" : ""}`}>
                            {s.content}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-stone-700)]">
                              {s.source === "AI_GENERATED" ? "AI" : "Manuellt"}
                            </span>
                            {s.status === "PENDING" && (
                              <>
                                <button
                                  className="rounded-full bg-[var(--color-mint-400)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-green-900)] transition hover:bg-[var(--color-mint-400)]/25"
                                  onClick={() => handleSuggestionStatus(s.id, "ACCEPTED")}
                                  type="button"
                                >
                                  Acceptera
                                </button>
                                <button
                                  className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] text-[var(--color-stone-700)] transition hover:bg-black/5"
                                  onClick={() => handleSuggestionStatus(s.id, "DISMISSED")}
                                  type="button"
                                >
                                  Avfärda
                                </button>
                              </>
                            )}
                            {s.status === "ACCEPTED" && (
                              <span className="rounded-full bg-[var(--color-mint-400)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-green-900)]">
                                Accepterat
                              </span>
                            )}
                            {s.status === "DISMISSED" && (
                              <span className="text-[10px] text-[var(--color-stone-700)]">
                                Avfärdat
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* CRM evidence detail */}
                {selectedPattern.crmEvidence && selectedPattern.crmEvidence.length > 0 && (
                  <section className="rounded-[1.5rem] border border-[var(--color-sky-400)]/20 bg-[var(--color-sky-400)]/5 p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-sky-400)]">
                      CRM-bevis
                    </p>
                    <div className="mt-3 grid gap-2">
                      {selectedPattern.crmEvidence.map((e) => (
                        <div key={e.id} className="rounded-2xl bg-white p-3">
                          <p className="text-sm leading-6">{e.narrative}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-stone-700)]">
                            {e.snapshot.category} &bull; {e.snapshot.ticketCount} ärenden &bull;{" "}
                            {formatDate(e.snapshot.snapshotDate)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Linked challenges */}
                <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                    Kopplade utmaningar ({selectedPattern.patternChallenges.length})
                  </p>
                  <div className="mt-3 grid gap-2">
                    {selectedPattern.patternChallenges.map((pc) => (
                      <div key={pc.challenge.id} className="rounded-2xl bg-[var(--color-cream-100)] p-3">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-[var(--color-green-900)]">
                            {pc.challenge.person.name}
                          </p>
                          {pc.challenge.customerName && (
                            <span className="rounded-full bg-[var(--color-sky-400)]/12 px-2 py-0.5 text-[9px] font-semibold text-[var(--color-sky-400)]">
                              {pc.challenge.customerName}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-6">{pc.challenge.contentRaw}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {pc.challenge.tags?.map((ct) => (
                            <span
                              key={ct.tag.id}
                              className="rounded-full bg-[var(--color-mint-400)]/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-green-900)]"
                            >
                              {ct.tag.name}
                            </span>
                          ))}
                        </div>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--color-stone-700)]">
                          {formatDate(pc.challenge.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <button
                  className="justify-self-start rounded-full border border-[var(--color-copper-500)]/25 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-copper-500)] transition hover:bg-[var(--color-copper-500)]/8"
                  onClick={() => handleDelete(selectedPattern.id)}
                  type="button"
                >
                  Ta bort mönster
                </button>
              </div>
            </aside>
          ) : (
            <aside className="rounded-[2rem] border border-white/10 bg-[var(--color-cream-50)] text-[var(--color-green-950)] shadow-[0_30px_100px_rgba(0,0,0,0.26)]">
              <div className="flex h-full min-h-[420px] items-center justify-center p-8">
                <div className="max-w-sm rounded-[1.75rem] border border-dashed border-black/10 bg-white p-6 text-center">
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                    Inget mönster valt
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[var(--color-stone-700)]">
                    Välj ett mönster för att se detaljer, kopplade utmaningar och CRM-bevis.
                  </p>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      {showImport && (
        <HistoricalImportDialog
          workspaceId={workspaceId}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            loadPatterns();
            loadImports();
          }}
        />
      )}
    </div>
  );
}
