"use client";

import { useState } from "react";
import { PersonData } from "./types";
import { api } from "./helpers";

type HistoricalImportDialogProps = {
  workspaceId: string;
  people: (PersonData & { teamId: string })[];
  onClose: () => void;
  onImported: () => void;
};

export function HistoricalImportDialog({
  workspaceId,
  people,
  onClose,
  onImported,
}: HistoricalImportDialogProps) {
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [sourceLabel, setSourceLabel] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ parsedCount: number } | null>(null);

  async function handleImport() {
    if (!personId || !rawContent.trim()) return;
    setImporting(true);
    const res = await api<{ parsedCount: number }>("/api/imports", {
      method: "POST",
      body: JSON.stringify({ workspaceId, personId, sourceLabel, rawContent }),
    });
    setResult(res);
    setImporting(false);
    onImported();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-[2rem] border border-white/10 bg-[var(--color-green-900)] p-6 text-white shadow-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
          Historisk import
        </p>
        <p className="mt-2 text-sm text-white/60">
          Klistra in gammal data — varje rad blir en utmaning kopplad till vald person.
        </p>

        {result ? (
          <div className="mt-6">
            <p className="text-lg font-semibold text-[var(--color-mint-300)]">
              {result.parsedCount} utmaningar importerade
            </p>
            <button
              className="mt-4 rounded-full bg-[var(--color-mint-400)] px-5 py-2.5 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)]"
              onClick={onClose}
              type="button"
            >
              Stäng
            </button>
          </div>
        ) : (
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.14em] text-white/60">Person</span>
              <select
                className="rounded-xl border border-white/12 bg-black/20 px-4 py-2.5 text-sm text-white outline-none"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.14em] text-white/60">
                Källa (valfritt)
              </span>
              <input
                className="rounded-xl border border-white/12 bg-black/20 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30"
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="t.ex. Supportlogg Q3, E-posttråd..."
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.14em] text-white/60">
                Data (en utmaning per rad)
              </span>
              <textarea
                className="min-h-40 rounded-xl border border-white/12 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30"
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                placeholder={"Kunder klagar på fakturering\nLång svarstid i chatten\nSaknar integration med Fortnox"}
              />
            </label>

            <div className="flex items-center gap-3">
              <button
                className="rounded-full bg-[var(--color-mint-400)] px-5 py-2.5 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-50"
                onClick={handleImport}
                disabled={importing || !rawContent.trim() || !personId}
                type="button"
              >
                {importing ? "Importerar..." : "Importera"}
              </button>
              <button
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/70 transition hover:bg-white/5"
                onClick={onClose}
                type="button"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
