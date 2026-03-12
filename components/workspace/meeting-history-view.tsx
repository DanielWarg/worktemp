"use client";

import { useEffect, useState } from "react";
import { api, formatDate } from "./helpers";

type MeetingListItem = {
  id: string;
  title: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  _count: { challenges: number; participants: number };
};

type MeetingDetail = {
  id: string;
  title: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  challenges: {
    id: string;
    contentRaw: string;
    createdAt: string;
    person: { id: string; name: string };
  }[];
  participants: {
    id: string;
    person: { id: string; name: string };
  }[];
};

type MeetingHistoryViewProps = {
  workspaceId: string;
  onBack: () => void;
};

export function MeetingHistoryView({ workspaceId, onBack }: MeetingHistoryViewProps) {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<MeetingListItem[]>(`/api/meetings?workspaceId=${workspaceId}`).then((data) => {
      if (!cancelled) {
        setMeetings(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [workspaceId]);

  async function handleSelect(meetingId: string) {
    const detail = await api<MeetingDetail>(`/api/meetings/${meetingId}`);
    setSelectedMeeting(detail);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-green-950)]">
        <p className="animate-pulse font-mono text-sm uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
          Laddar möteshistorik...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(91,191,160,0.14),transparent_28%),linear-gradient(180deg,#102a24_0%,#0c211c_48%,#07110f_100%)] text-[var(--color-cream-50)]">
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6">
        <header className="rounded-[2rem] border border-white/10 bg-white/6 px-5 py-5 backdrop-blur-sm">
          <button
            className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-white/50 transition hover:text-white"
            onClick={onBack}
            type="button"
          >
            &larr; Tillbaka
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Möteshistorik
          </h1>
          <p className="mt-2 text-sm text-[var(--color-cream-100)]/72">
            {meetings.length} möte{meetings.length !== 1 ? "n" : ""} registrerade
          </p>
        </header>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_480px]">
          {/* Timeline */}
          <div className="grid gap-3">
            {meetings.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-white/14 bg-black/8 p-12 text-center">
                <p className="text-sm text-[var(--color-cream-100)]/66">Inga möten ännu.</p>
              </div>
            ) : (
              meetings.map((m) => (
                <button
                  key={m.id}
                  className={`w-full rounded-[1.75rem] border p-4 text-left transition ${
                    selectedMeeting?.id === m.id
                      ? "border-[var(--color-mint-400)]/40 bg-white/10"
                      : "border-white/10 bg-white/5 hover:bg-white/8"
                  }`}
                  onClick={() => handleSelect(m.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-white">
                        {m.title || (m.startedAt ? formatDate(m.startedAt) : "Möte")}
                      </h3>
                      <p className="mt-1 text-sm text-white/50">
                        {m._count.challenges} utmaningar &bull; {m._count.participants} deltagare
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        m.status === "COMPLETED"
                          ? "bg-[var(--color-mint-400)]/20 text-[var(--color-mint-300)]"
                          : m.status === "ACTIVE"
                          ? "bg-[var(--color-copper-500)]/20 text-[var(--color-copper-400)]"
                          : "bg-white/10 text-white/50"
                      }`}
                    >
                      {m.status === "COMPLETED" ? "Avslutat" : m.status === "ACTIVE" ? "Pågår" : "Planerat"}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Detail */}
          {selectedMeeting ? (
            <aside className="rounded-[2rem] border border-white/10 bg-[var(--color-cream-50)] text-[var(--color-green-950)] shadow-[0_30px_100px_rgba(0,0,0,0.26)]">
              <div className="border-b border-black/8 px-6 py-5">
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--color-copper-500)]">
                  Mötesdetalj
                </p>
                <h2 className="mt-3 text-xl font-semibold">
                  {selectedMeeting.title || "Möte"}
                </h2>
                {selectedMeeting.startedAt && (
                  <p className="mt-1 text-sm text-[var(--color-stone-700)]">
                    {formatDate(selectedMeeting.startedAt)}
                  </p>
                )}
                <p className="mt-2 text-sm text-[var(--color-stone-700)]">
                  {selectedMeeting.participants.length} deltagare &bull;{" "}
                  {selectedMeeting.challenges.length} utmaningar
                </p>
              </div>
              <div className="grid gap-4 px-6 py-5">
                {/* Participants */}
                <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                    Deltagare
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedMeeting.participants.map((p) => (
                      <span
                        key={p.id}
                        className="rounded-full bg-[var(--color-cream-100)] px-3 py-1 text-xs font-medium"
                      >
                        {p.person.name}
                      </span>
                    ))}
                  </div>
                </section>

                {/* Challenges */}
                <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                    Utmaningar ({selectedMeeting.challenges.length})
                  </p>
                  <div className="mt-3 grid gap-2">
                    {selectedMeeting.challenges.map((c) => (
                      <div key={c.id} className="rounded-2xl bg-[var(--color-cream-100)] p-3">
                        <p className="text-xs font-semibold text-[var(--color-green-900)]">
                          {c.person.name}
                        </p>
                        <p className="mt-1 text-sm leading-6">{c.contentRaw}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </aside>
          ) : (
            <aside className="rounded-[2rem] border border-white/10 bg-[var(--color-cream-50)] text-[var(--color-green-950)]">
              <div className="flex h-full min-h-[420px] items-center justify-center p-8">
                <p className="text-sm text-[var(--color-stone-700)]">Välj ett möte för detaljer.</p>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
