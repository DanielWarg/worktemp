"use client";

import { useState, useRef } from "react";
import { PersonData } from "./types";
import { api } from "./helpers";

type HistoricalImportDialogProps = {
  workspaceId: string;
  people: (PersonData & { teamId: string })[];
  teams: { id: string; name: string }[];
  onClose: () => void;
  onImported: () => void;
};

type XlsxPreview = {
  sheetName: string;
  totalRows: number;
  owners: string[];
  accounts: string[];
  statuses: string[];
  types: string[];
  sampleRows: {
    caseNumber: string;
    title: string;
    owner: string;
    account: string;
    status: string;
    priority: string;
  }[];
};

type ImportResult = {
  challengeCount: number;
  personCount: number;
};

export function HistoricalImportDialog({
  workspaceId,
  people,
  teams,
  onClose,
  onImported,
}: HistoricalImportDialogProps) {
  const [mode, setMode] = useState<"choose" | "text" | "file">("choose");
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [sourceLabel, setSourceLabel] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ parsedCount: number } | null>(null);

  const [dataContext, setDataContext] = useState("");

  // File upload state
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<XlsxPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [fileResult, setFileResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function saveContext() {
    if (dataContext.trim()) {
      await api(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        body: JSON.stringify({ systemContext: dataContext.trim() }),
      });
    }
  }

  async function handleTextImport() {
    if (!personId || !rawContent.trim()) return;
    setImporting(true);
    await saveContext();
    const res = await api<{ parsedCount: number }>("/api/imports", {
      method: "POST",
      body: JSON.stringify({ workspaceId, personId, sourceLabel, rawContent }),
    });
    setResult(res);
    setImporting(false);
    onImported();
  }

  async function handleFileSelect(file: File) {
    if (!file.name.match(/\.xlsx?$/i)) return;
    setSelectedFile(file);
    setPreviewing(true);

    const form = new FormData();
    form.append("file", file);
    form.append("mode", "preview");

    const res = await fetch("/api/imports/xlsx", { method: "POST", body: form });
    const data = await res.json();
    setPreview(data);
    setPreviewing(false);
  }

  async function handleFileImport() {
    if (!selectedFile) return;
    setImporting(true);
    await saveContext();

    const form = new FormData();
    form.append("file", selectedFile);
    form.append("workspaceId", workspaceId);
    form.append("mode", "commit");
    if (teamId) form.append("teamId", teamId);

    const res = await fetch("/api/imports/xlsx", { method: "POST", body: form });
    const data = await res.json();
    setFileResult(data);
    setImporting(false);
    onImported();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  // Result screen
  if (result) {
    return (
      <Overlay>
        <Header />
        <div className="mt-6">
          <p className="text-lg font-semibold text-[var(--color-mint-300)]">
            {result.parsedCount} utmaningar importerade
          </p>
          <CloseButton onClick={onClose} />
        </div>
      </Overlay>
    );
  }

  if (fileResult) {
    return (
      <Overlay>
        <Header />
        <div className="mt-6 space-y-2">
          <p className="text-lg font-semibold text-[var(--color-mint-300)]">
            Import klar
          </p>
          <p className="text-sm text-white/70">
            {fileResult.challengeCount} ärenden importerade
          </p>
          {fileResult.personCount > 0 && (
            <p className="text-sm text-white/70">
              {fileResult.personCount} nya personer skapade
            </p>
          )}
          <CloseButton onClick={onClose} />
        </div>
      </Overlay>
    );
  }

  // Choose mode
  if (mode === "choose") {
    return (
      <Overlay>
        <Header />
        <p className="mt-2 text-sm text-white/60">
          Välj hur du vill importera historisk data.
        </p>

        {/* Data context */}
        <label className="mt-5 grid gap-2">
          <span className="text-xs uppercase tracking-[0.14em] text-white/60">
            Beskriv datan
          </span>
          <textarea
            className="min-h-[4rem] resize-none rounded-xl border border-white/12 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-[var(--color-mint-400)]/30"
            value={dataContext}
            onChange={(e) => setDataContext(e.target.value)}
            placeholder='T.ex. "Supportärenden från ett kollektivtrafikföretag som utvecklar realtidssystem"'
          />
          <p className="text-[10px] text-white/30">
            Hjälper AI:n förstå domänen vid analys. Sparas på workspacen.
          </p>
        </label>

        <div className="mt-4 grid gap-3">
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-[var(--color-mint-400)]/30 hover:bg-white/8"
            onClick={() => setMode("file")}
          >
            <p className="font-semibold text-white">Excel-fil (.xlsx)</p>
            <p className="mt-1 text-sm text-white/60">
              Ladda upp en exporterad supportlogg. Kolumner mappas automatiskt.
            </p>
          </button>
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-[var(--color-mint-400)]/30 hover:bg-white/8"
            onClick={() => setMode("text")}
          >
            <p className="font-semibold text-white">Fritext</p>
            <p className="mt-1 text-sm text-white/60">
              Klistra in text — varje rad blir en utmaning.
            </p>
          </button>
        </div>
        <div className="mt-4">
          <CancelButton onClick={onClose} />
        </div>
      </Overlay>
    );
  }

  // File upload mode
  if (mode === "file") {
    return (
      <Overlay wide>
        <Header />

        {!preview && !previewing && (
          <div
            className={`mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition ${
              dragOver
                ? "border-[var(--color-mint-400)] bg-[var(--color-mint-400)]/10"
                : "border-white/20 bg-black/20 hover:border-white/40"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <p className="text-sm text-white/60">
              Dra och släpp .xlsx-fil här, eller klicka för att välja
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          </div>
        )}

        {previewing && (
          <div className="mt-6 flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-mint-400)] border-t-transparent" />
            <p className="text-sm text-white/60">Analyserar fil...</p>
          </div>
        )}

        {preview && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-white">
                {selectedFile?.name}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/60">
                <span>{preview.totalRows} ärenden</span>
                <span>{preview.owners.length} ägare</span>
                <span>{preview.accounts.length} kunder</span>
              </div>
            </div>

            {/* Sample rows */}
            <div className="max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/20">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-left text-white/50">
                    <th className="px-3 py-2">Ärende</th>
                    <th className="px-3 py-2">Rubrik</th>
                    <th className="px-3 py-2">Ägare</th>
                    <th className="px-3 py-2">Kund</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((row) => (
                    <tr
                      key={row.caseNumber}
                      className="border-b border-white/5 text-white/70"
                    >
                      <td className="px-3 py-2 font-mono">{row.caseNumber}</td>
                      <td className="max-w-[200px] truncate px-3 py-2">
                        {row.title}
                      </td>
                      <td className="px-3 py-2">{row.owner}</td>
                      <td className="max-w-[120px] truncate px-3 py-2">
                        {row.account}
                      </td>
                      <td className="px-3 py-2">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Owners that will be created */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-white/50">
                Personer som skapas (ägare)
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {preview.owners.map((o) => (
                  <span
                    key={o}
                    className="rounded-full bg-[var(--color-mint-400)]/15 px-3 py-1 text-xs text-[var(--color-mint-300)]"
                  >
                    {o}
                  </span>
                ))}
              </div>
            </div>

            {/* Team selector */}
            <label className="grid gap-2">
              <span className="text-xs uppercase tracking-[0.14em] text-white/60">
                Lägg till i team
              </span>
              <select
                className="rounded-xl border border-white/12 bg-black/20 px-4 py-2.5 text-sm text-white outline-none"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">Skapa nytt team &quot;Support&quot;</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-3">
              <button
                className="rounded-full bg-[var(--color-mint-400)] px-5 py-2.5 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-50"
                onClick={handleFileImport}
                disabled={importing}
                type="button"
              >
                {importing
                  ? "Importerar..."
                  : `Importera ${preview.totalRows} ärenden`}
              </button>
              <CancelButton onClick={onClose} />
            </div>
          </div>
        )}

        {!preview && !previewing && (
          <div className="mt-4">
            <button
              className="text-sm text-white/50 transition hover:text-white/80"
              onClick={() => setMode("choose")}
              type="button"
            >
              &larr; Tillbaka
            </button>
          </div>
        )}
      </Overlay>
    );
  }

  // Text mode (original)
  return (
    <Overlay>
      <Header />
      <p className="mt-2 text-sm text-white/60">
        Klistra in data — varje rad blir en utmaning kopplad till vald person.
      </p>
      <div className="mt-4 grid gap-4">
        <label className="grid gap-2">
          <span className="text-xs uppercase tracking-[0.14em] text-white/60">
            Person
          </span>
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
            placeholder={
              "Kunder klagar på fakturering\nLång svarstid i chatten\nSaknar integration med Fortnox"
            }
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            className="rounded-full bg-[var(--color-mint-400)] px-5 py-2.5 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-50"
            onClick={handleTextImport}
            disabled={importing || !rawContent.trim() || !personId}
            type="button"
          >
            {importing ? "Importerar..." : "Importera"}
          </button>
          <CancelButton onClick={onClose} />
        </div>
      </div>
      <div className="mt-3">
        <button
          className="text-sm text-white/50 transition hover:text-white/80"
          onClick={() => setMode("choose")}
          type="button"
        >
          &larr; Tillbaka
        </button>
      </div>
    </Overlay>
  );
}

// Shared UI pieces

function Overlay({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={`mx-4 w-full rounded-[2rem] border border-white/10 bg-[var(--color-green-900)] p-6 text-white shadow-2xl ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Header() {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
      Historisk import
    </p>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="mt-4 rounded-full bg-[var(--color-mint-400)] px-5 py-2.5 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)]"
      onClick={onClick}
      type="button"
    >
      Stäng
    </button>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/70 transition hover:bg-white/5"
      onClick={onClick}
      type="button"
    >
      Avbryt
    </button>
  );
}
