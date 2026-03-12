"use client";

import { useCallback, useEffect, useState } from "react";
import { PatternData } from "./types";
import { api, formatDate } from "./helpers";

type PatternViewProps = {
  workspaceId: string;
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

export function PatternView({ workspaceId, onBack }: PatternViewProps) {
  const [patterns, setPatterns] = useState<PatternData[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);

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
    return () => { cancelled = true; };
  }, [workspaceId]);

  async function handleDetect() {
    setDetecting(true);
    await api("/api/patterns/detect", {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    });
    await loadPatterns();
    setDetecting(false);
  }

  async function handleAIAnalysis() {
    setAiRunning(true);
    await api("/api/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
    });
    await loadPatterns();
    setAiRunning(false);
  }

  async function handleSuggestionStatus(suggestionId: string, status: string) {
    await api(`/api/suggestions/${suggestionId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadPatterns();
  }

  async function handleUpdateStatus(patternId: string, status: string) {
    await api(`/api/patterns/${patternId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadPatterns();
  }

  async function handleDelete(patternId: string) {
    await api(`/api/patterns/${patternId}`, { method: "DELETE" });
    if (selectedPatternId === patternId) setSelectedPatternId(null);
    await loadPatterns();
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
              Mönster som identifierats i teamets utmaningar. Gruppera via taggar eller kör automatisk detektion.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/60 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
              onClick={handleDetect}
              disabled={detecting}
              type="button"
            >
              {detecting ? "Analyserar..." : "Tagg-detektion"}
            </button>
            <button
              className="rounded-full bg-[var(--color-mint-400)] px-5 py-2.5 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-50"
              onClick={handleAIAnalysis}
              disabled={aiRunning}
              type="button"
            >
              {aiRunning ? "AI analyserar..." : "AI-analys"}
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_480px]">
          {/* Pattern list */}
          <div className="grid gap-4">
            {patterns.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-white/14 bg-black/8 p-12 text-center">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-mint-300)]">
                  Inga mönster ännu
                </p>
                <p className="mt-3 max-w-sm mx-auto text-sm text-[var(--color-cream-100)]/66">
                  Tagga utmaningar och kör detektion, eller skapa mönster manuellt.
                </p>
              </div>
            ) : (
              patterns.map((pattern) => (
                <button
                  key={pattern.id}
                  className={`w-full rounded-[1.75rem] border p-5 text-left transition ${
                    pattern.id === selectedPatternId
                      ? "border-[var(--color-mint-400)]/40 bg-white/10"
                      : "border-white/10 bg-white/5 hover:bg-white/8"
                  }`}
                  onClick={() => setSelectedPatternId(pattern.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{pattern.title}</h3>
                      {pattern.description && (
                        <p className="mt-1 text-sm text-white/60">{pattern.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
                        {pattern.occurrenceCount}x
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
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
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                      {TYPE_LABELS[pattern.patternType] ?? pattern.patternType}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                      Senast: {formatDate(pattern.lastSeenAt)}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                      {pattern.patternChallenges.length} kopplad{pattern.patternChallenges.length !== 1 ? "e" : ""} utmaning{pattern.patternChallenges.length !== 1 ? "ar" : ""}
                    </span>
                  </div>
                  {/* CRM evidence preview */}
                  {pattern.crmEvidence && pattern.crmEvidence.length > 0 && (
                    <div className="mt-3 rounded-xl border border-[var(--color-sky-400)]/20 bg-[var(--color-sky-400)]/5 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sky-400)]">
                        CRM-data
                      </p>
                      <p className="mt-1 text-sm text-white/70">
                        {pattern.crmEvidence[0].narrative}
                      </p>
                    </div>
                  )}
                </button>
              ))
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
                        <p className="text-xs font-semibold text-[var(--color-green-900)]">
                          {pc.challenge.person.name}
                        </p>
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
    </div>
  );
}
