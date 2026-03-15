"use client";

import { useEffect, useState } from "react";
import { CrmConnectionData } from "./types";
import { api, formatDate } from "./helpers";

type CrmSettingsViewProps = {
  workspaceId: string;
  onBack: () => void;
};

type ConnectionWithCount = CrmConnectionData & { _count: { snapshots: number } };

const PROVIDERS = [
  { value: "FRESHDESK", label: "Freshdesk", needsBaseUrl: true },
  { value: "ZENDESK", label: "Zendesk", needsBaseUrl: true },
  { value: "HUBSPOT", label: "HubSpot", needsBaseUrl: false },
];

export function CrmSettingsView({ workspaceId, onBack }: CrmSettingsViewProps) {
  const [connections, setConnections] = useState<ConnectionWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Form state
  const [provider, setProvider] = useState("FRESHDESK");
  const [displayName, setDisplayName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<ConnectionWithCount[]>(`/api/crm/connections?workspaceId=${workspaceId}`).then((data) => {
      if (!cancelled) {
        setConnections(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [workspaceId]);

  async function reload() {
    const data = await api<ConnectionWithCount[]>(`/api/crm/connections?workspaceId=${workspaceId}`);
    setConnections(data);
  }

  async function handleAdd() {
    if (!apiKey.trim()) return;
    setSaving(true);
    await api("/api/crm/connections", {
      method: "POST",
      body: JSON.stringify({
        workspaceId,
        provider,
        displayName: displayName || provider,
        apiKey,
        baseUrl: baseUrl || null,
      }),
    });
    setShowAdd(false);
    setApiKey("");
    setBaseUrl("");
    setDisplayName("");
    setSaving(false);
    await reload();
  }

  async function handleSync(connectionId: string) {
    setSyncing(connectionId);
    await api("/api/crm/sync", {
      method: "POST",
      body: JSON.stringify({ connectionId, workspaceId }),
    });
    setSyncing(null);
    await reload();
  }

  async function handleDelete(connectionId: string) {
    await api(`/api/crm/connections/${connectionId}`, { method: "DELETE" });
    await reload();
  }

  async function handleToggle(connectionId: string, isActive: boolean) {
    await api(`/api/crm/connections/${connectionId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
    await reload();
  }

  const selectedProvider = PROVIDERS.find((p) => p.value === provider);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-green-950)]">
        <p className="animate-pulse font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
          Laddar CRM...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(91,191,160,0.14),transparent_28%),linear-gradient(180deg,#102a24_0%,#0c211c_48%,#07110f_100%)] text-[var(--color-cream-50)]">
      <div className="mx-auto max-w-[900px] px-4 py-4 md:px-6">
        {/* Header */}
        <header className="rounded-[2rem] border border-white/10 bg-white/6 px-5 py-5 backdrop-blur-sm">
          <button
            className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-white/50 transition hover:text-white"
            onClick={onBack}
            type="button"
          >
            &larr; Tillbaka till workspace
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            CRM-integrationer
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-cream-100)]/72">
            Koppla CRM-system för att berika mönster med hård ärendedata.
          </p>
        </header>

        {/* Connections list */}
        <div className="mt-4 grid gap-4">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">{conn.displayName}</h3>
                  <p className="mt-1 text-sm text-white/60">
                    {conn.provider} &bull;{" "}
                    {conn.lastSyncAt
                      ? `Senast synkad: ${formatDate(conn.lastSyncAt)}`
                      : "Aldrig synkad"}{" "}
                    &bull; {conn._count.snapshots} datapunkter
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      conn.syncStatus === "SYNCING"
                        ? "animate-pulse bg-[var(--color-mint-400)]"
                        : conn.syncStatus === "ERROR"
                        ? "bg-red-400"
                        : conn.isActive
                        ? "bg-[var(--color-mint-400)]"
                        : "bg-white/30"
                    }`}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-[var(--color-mint-400)] px-4 py-2 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-50"
                  onClick={() => handleSync(conn.id)}
                  disabled={syncing === conn.id}
                  type="button"
                >
                  {syncing === conn.id ? "Synkar..." : "Synka nu"}
                </button>
                <button
                  className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/60 transition hover:bg-white/5"
                  onClick={() => handleToggle(conn.id, !conn.isActive)}
                  type="button"
                >
                  {conn.isActive ? "Inaktivera" : "Aktivera"}
                </button>
                <button
                  className="rounded-full border border-red-400/30 px-4 py-2 text-sm text-red-300 transition hover:bg-red-400/10"
                  onClick={() => handleDelete(conn.id)}
                  type="button"
                >
                  Ta bort
                </button>
              </div>
            </div>
          ))}

          {connections.length === 0 && !showAdd && (
            <div className="rounded-[2rem] border border-dashed border-white/14 bg-black/8 p-12 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-mint-300)]">
                Inga CRM-kopplingar
              </p>
              <p className="mt-3 max-w-sm mx-auto text-sm text-[var(--color-cream-100)]/66">
                Lägg till en CRM-koppling för att berika mönster med ärendedata.
              </p>
            </div>
          )}

          {/* Add connection form */}
          {showAdd ? (
            <div className="rounded-[1.75rem] border border-[var(--color-mint-400)]/30 bg-white/8 p-5">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-mint-300)]">
                Ny koppling
              </p>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-white/60">Provider</span>
                  <select
                    className="rounded-xl border border-white/12 bg-black/20 px-4 py-2.5 text-sm text-white outline-none"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-white/60">
                    Visningsnamn
                  </span>
                  <input
                    className="rounded-xl border border-white/12 bg-black/20 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="t.ex. Vår Freshdesk"
                  />
                </label>

                {selectedProvider?.needsBaseUrl && (
                  <label className="grid gap-2">
                    <span className="text-xs uppercase tracking-[0.14em] text-white/60">
                      Bas-URL
                    </span>
                    <input
                      className="rounded-xl border border-white/12 bg-black/20 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://dittforetag.freshdesk.com"
                    />
                  </label>
                )}

                <label className="grid gap-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-white/60">
                    API-nyckel
                  </span>
                  <input
                    className="rounded-xl border border-white/12 bg-black/20 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Din API-nyckel"
                    type="password"
                  />
                </label>

                <div className="flex items-center gap-3">
                  <button
                    className="rounded-full bg-[var(--color-mint-400)] px-5 py-2.5 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-50"
                    onClick={handleAdd}
                    disabled={saving || !apiKey.trim()}
                    type="button"
                  >
                    {saving ? "Sparar..." : "Lägg till"}
                  </button>
                  <button
                    className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/60 transition hover:bg-white/5"
                    onClick={() => setShowAdd(false)}
                    type="button"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              className="rounded-full border border-dashed border-white/20 px-5 py-3 text-sm text-white/60 transition hover:border-[var(--color-mint-400)]/40 hover:text-[var(--color-mint-300)]"
              onClick={() => setShowAdd(true)}
              type="button"
            >
              + Lägg till CRM-koppling
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
