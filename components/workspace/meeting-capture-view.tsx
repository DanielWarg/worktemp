"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PersonData, TeamData, MeetingSessionData, ChallengeData } from "./types";
import { api, initialsFromName } from "./helpers";

type MeetingCaptureViewProps = {
  workspaceId: string;
  teams: TeamData[];
  allPeople: (PersonData & { teamId: string })[];
  onEnd: () => void;
};

export function MeetingCaptureView({
  workspaceId,
  teams,
  allPeople,
  onEnd,
}: MeetingCaptureViewProps) {
  const [session, setSession] = useState<MeetingSessionData | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [captureText, setCaptureText] = useState("");
  const [challenges, setChallenges] = useState<(ChallengeData & { personName: string })[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Create and start session on mount
  useEffect(() => {
    let cancelled = false;
    async function startSession() {
      const created = await api<MeetingSessionData>("/api/meetings", {
        method: "POST",
        body: JSON.stringify({ workspaceId }),
      });
      if (cancelled) return;
      // Start it immediately
      const started = await api<MeetingSessionData>(`/api/meetings/${created.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      if (!cancelled) setSession(started);
    }
    startSession();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const handleCapture = useCallback(async () => {
    const text = captureText.trim();
    if (!text || !selectedPersonId || !session || submitting) return;

    setSubmitting(true);
    const challenge = await api<ChallengeData>(`/api/meetings/${session.id}/challenges`, {
      method: "POST",
      body: JSON.stringify({ personId: selectedPersonId, contentRaw: text }),
    });

    const person = allPeople.find((p) => p.id === selectedPersonId);
    setChallenges((prev) => [
      { ...challenge, personName: person?.name ?? "Okänd" },
      ...prev,
    ]);
    setCaptureText("");
    setSubmitting(false);
    inputRef.current?.focus();
  }, [captureText, selectedPersonId, session, submitting, allPeople]);

  async function handleEndMeeting() {
    if (!session) return;
    await api(`/api/meetings/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    onEnd();
  }

  const selectedPerson = allPeople.find((p) => p.id === selectedPersonId);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-green-950)]">
      {/* Meeting header */}
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
            Möte pågår
          </p>
          <p className="mt-1 text-sm text-white/60">
            {challenges.length} utmaning{challenges.length !== 1 ? "ar" : ""} fångade
          </p>
        </div>
        <button
          className="rounded-full border border-red-400/30 bg-red-400/10 px-5 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-400/20"
          onClick={handleEndMeeting}
          type="button"
        >
          Avsluta möte
        </button>
      </header>

      {/* Main capture area */}
      <div className="flex flex-1 gap-0">
        {/* Left: participant list */}
        <div className="w-64 shrink-0 overflow-y-auto border-r border-white/10 p-4">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">
            Deltagare
          </p>
          <div className="grid gap-2">
            {teams.map((team) => (
              <div key={team.id}>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
                  {team.name}
                </p>
                {team.memberships.map((m) => {
                  const isActive = m.person.id === selectedPersonId;
                  const personChallengeCount = challenges.filter(
                    (c) => c.personName === m.person.name
                  ).length;

                  return (
                    <button
                      key={m.person.id}
                      className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        isActive
                          ? "bg-[var(--color-mint-400)]/15 text-[var(--color-mint-300)]"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`}
                      onClick={() => {
                        setSelectedPersonId(m.person.id);
                        inputRef.current?.focus();
                      }}
                      type="button"
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                          isActive
                            ? "bg-[var(--color-mint-400)] text-[var(--color-green-950)]"
                            : "bg-white/10 text-white/60"
                        }`}
                      >
                        {initialsFromName(m.person.name)}
                      </div>
                      <div className="flex-1 truncate">
                        <p className="truncate text-sm font-medium">{m.person.name}</p>
                        {m.person.roleTitle && (
                          <p className="truncate text-[10px] opacity-50">{m.person.roleTitle}</p>
                        )}
                      </div>
                      {personChallengeCount > 0 && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold">
                          {personChallengeCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Center: capture input */}
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          <div className="w-full max-w-2xl">
            {selectedPerson ? (
              <p className="mb-4 text-center text-lg text-white/80">
                <span className="font-semibold text-[var(--color-mint-300)]">
                  {selectedPerson.name}
                </span>{" "}
                säger:
              </p>
            ) : (
              <p className="mb-4 text-center text-lg text-white/40">
                Klicka på en person till vänster
              </p>
            )}

            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                className="flex-1 rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-lg text-white outline-none placeholder:text-white/30 focus:border-[var(--color-mint-400)]/50 focus:bg-white/8"
                value={captureText}
                onChange={(e) => setCaptureText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCapture()}
                placeholder={
                  selectedPerson
                    ? "Vad lyfter personen? Tryck Enter..."
                    : "Välj en person först..."
                }
                disabled={!selectedPersonId || submitting}
                autoComplete="off"
                autoFocus
              />
              <button
                className="rounded-2xl bg-[var(--color-mint-400)] px-6 py-4 text-lg font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)] disabled:opacity-40"
                onClick={handleCapture}
                disabled={!selectedPersonId || !captureText.trim() || submitting}
                type="button"
              >
                Fånga
              </button>
            </div>

            <p className="mt-3 text-center text-xs text-white/30">
              Välj person → skriv → Enter. Byt person och upprepa.
            </p>
          </div>
        </div>

        {/* Right: captured challenges feed */}
        <div className="w-80 shrink-0 overflow-y-auto border-l border-white/10 p-4">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">
            Fångade utmaningar
          </p>
          {challenges.length === 0 ? (
            <p className="text-sm text-white/30">
              Utmaningar dyker upp här allt eftersom de fångas.
            </p>
          ) : (
            <div className="grid gap-3">
              {challenges.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-white/8 bg-white/5 p-3"
                >
                  <p className="text-xs font-semibold text-[var(--color-mint-300)]">
                    {c.personName}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-white/80">
                    {c.contentRaw}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
