"use client";

import { useEffect, useState } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

type Workspace = {
  id: string;
  name: string;
};

export default function WorkspacePage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [wsName, setWsName] = useState("");

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data: Workspace[]) => {
        if (data.length > 0) {
          setWorkspaceId(data[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleCreate() {
    const name = wsName.trim() || "Min arbetsyta";
    setCreating(true);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const ws: Workspace = await res.json();
    setWorkspaceId(ws.id);
    setCreating(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-green-950)] text-[var(--color-cream-50)]">
        <p className="animate-pulse font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
          Laddar...
        </p>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(91,191,160,0.14),transparent_28%),linear-gradient(180deg,#102a24_0%,#0c211c_48%,#07110f_100%)] text-[var(--color-cream-50)]">
        <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-white/6 p-8 text-center backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
            Välkommen
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
            Skapa din arbetsyta
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-cream-100)]/72">
            En arbetsyta samlar dina team, personer och all dokumentation på ett ställe.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <input
              className="rounded-full border border-white/12 bg-black/10 px-5 py-3 text-sm text-white outline-none placeholder:text-white/40"
              onChange={(e) => setWsName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Namn på arbetsyta"
              value={wsName}
            />
            <button
              className="rounded-full bg-[var(--color-mint-400)] px-5 py-3 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-50"
              disabled={creating}
              onClick={handleCreate}
              type="button"
            >
              {creating ? "Skapar..." : "Skapa arbetsyta"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <WorkspaceShell workspaceId={workspaceId} />;
}
