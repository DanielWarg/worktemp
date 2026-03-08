"use client";

import { useState } from "react";

type Note = {
  id: string;
  content: string;
  createdAt: string;
};

type FileItem = {
  id: string;
  name: string;
  meta: string;
  comment: string;
};

type Person = {
  id: string;
  name: string;
  role: string;
  initials: string;
  summary: string;
  notes: Note[];
  files: FileItem[];
};

type Team = {
  id: string;
  name: string;
  accent: string;
  people: Person[];
};

const teams: Team[] = [
  {
    id: "leadership",
    name: "Ledningsgrupp",
    accent: "bg-[var(--color-mint-400)]",
    people: [
      {
        id: "daniel",
        name: "Daniel Warg",
        role: "Team lead",
        initials: "DW",
        summary:
          "Äger workspace-strukturen och driver införandet av den visuella canvasen.",
        notes: [
          {
            id: "note-1",
            content: "Behöver kunna flytta personer mellan team utan att tappa anteckningar.",
            createdAt: "8 mars 2026",
          },
          {
            id: "note-2",
            content: "Vill använda canvasen i onboarding för nya chefer.",
            createdAt: "7 mars 2026",
          },
        ],
        files: [
          {
            id: "file-1",
            name: "team-brief.pdf",
            meta: "PDF • 420 KB",
            comment: "Kort brief som används vid första onboarding-sessionen.",
          },
        ],
      },
      {
        id: "sara",
        name: "Sara Nyström",
        role: "Operations manager",
        initials: "SN",
        summary: "Säkrar arbetsflöden, ansvarsmappning och tydlighet mellan teamen.",
        notes: [
          {
            id: "note-3",
            content: "Behöver en snabb överblick innan veckans ledningsmöte.",
            createdAt: "6 mars 2026",
          },
        ],
        files: [],
      },
    ],
  },
  {
    id: "delivery",
    name: "Delivery",
    accent: "bg-[var(--color-copper-400)]",
    people: [
      {
        id: "leo",
        name: "Leo Sand",
        role: "Product designer",
        initials: "LS",
        summary: "Jobbar med de visuella mönstren för teamcontainrar och detaljpanelen.",
        notes: [
          {
            id: "note-4",
            content: "Behöver snabb preview av tomma tillstånd och onboarding-steg.",
            createdAt: "5 mars 2026",
          },
        ],
        files: [
          {
            id: "file-2",
            name: "wireframes.fig",
            meta: "FIG • 1.2 MB",
            comment: "Tidiga skisser för canvas och sidopanel.",
          },
        ],
      },
      {
        id: "mila",
        name: "Mila Borg",
        role: "Frontend engineer",
        initials: "MB",
        summary: "Bygger app shell, states och första deploybara frontendgrunden.",
        notes: [],
        files: [],
      },
    ],
  },
  {
    id: "people",
    name: "People & Support",
    accent: "bg-white/75",
    people: [
      {
        id: "ida",
        name: "Ida Blom",
        role: "People partner",
        initials: "IB",
        summary: "Fångar upp strukturbehov och ser till att persondata hanteras varsamt.",
        notes: [
          {
            id: "note-5",
            content: "Vill se tydlig skillnad mellan användarkonto och personkort i UI:t.",
            createdAt: "4 mars 2026",
          },
        ],
        files: [],
      },
    ],
  },
];

export function WorkspaceShell() {
  const [selectedPersonId, setSelectedPersonId] = useState("daniel");

  const selectedPerson =
    teams.flatMap((team) => team.people).find((person) => person.id === selectedPersonId) ??
    teams[0].people[0];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(91,191,160,0.14),transparent_28%),linear-gradient(180deg,#102a24_0%,#0c211c_48%,#07110f_100%)] text-[var(--color-cream-50)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 md:px-6">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/6 px-5 py-5 backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-mint-300)]">
              Workspace
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              North Star Team
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-cream-100)]/72">
              Första appskalet för Modul 1. Teamcontainrar, personkort och detaljpanel
              är nu byggda som klickbar mockad UI.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10">
              + Lägg till team
            </button>
            <button className="rounded-full bg-[var(--color-mint-400)] px-4 py-2 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)]">
              Invite disabled i Modul 1
            </button>
          </div>
        </header>

        <div className="mt-4 grid flex-1 gap-4 xl:grid-cols-[1fr_400px]">
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))]">
            <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:18px_18px] opacity-35" />

            <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-mint-300)]">
                  Canvas
                </p>
                <p className="mt-2 text-sm text-[var(--color-cream-100)]/68">
                  Semistrukturerad yta med teamcontainrar och reserverad plats för drag
                  and drop.
                </p>
              </div>

              <div className="flex gap-2 text-xs text-[var(--color-cream-100)]/70">
                <span className="rounded-full border border-white/10 px-3 py-1.5">75%</span>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                  100%
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1.5">125%</span>
              </div>
            </div>

            <div className="relative grid gap-5 p-5 xl:grid-cols-2">
              {teams.map((team) => (
                <article
                  key={team.id}
                  className="rounded-[1.75rem] border border-white/10 bg-[rgba(255,255,255,0.07)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.16)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full ${team.accent}`} />
                      <div>
                        <h2 className="text-base font-semibold text-white">{team.name}</h2>
                        <p className="text-sm text-[var(--color-cream-100)]/62">
                          {team.people.length} personer
                        </p>
                      </div>
                    </div>

                    <button className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--color-cream-100)]/72 transition hover:bg-white/8">
                      + Person
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {team.people.map((person) => {
                      const isSelected = person.id === selectedPerson.id;

                      return (
                        <button
                          key={person.id}
                          className={`rounded-[1.35rem] p-4 text-left transition ${
                            isSelected
                              ? "bg-[var(--color-surface-card)] text-[var(--color-green-950)] shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
                              : "border border-white/10 bg-white/5 text-white hover:-translate-y-0.5 hover:bg-white/10"
                          }`}
                          onClick={() => setSelectedPersonId(person.id)}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-green-900)] text-sm font-semibold text-[var(--color-mint-300)]">
                              {person.initials}
                            </div>
                            <span className="font-mono text-[11px] uppercase tracking-[0.18em] opacity-55">
                              Card
                            </span>
                          </div>
                          <p className="mt-4 text-base font-semibold">{person.name}</p>
                          <p
                            className={`mt-1 text-sm ${
                              isSelected
                                ? "text-[var(--color-stone-700)]"
                                : "text-[var(--color-cream-100)]/68"
                            }`}
                          >
                            {person.role}
                          </p>
                          <div
                            className={`mt-4 h-1.5 rounded-full ${
                              isSelected ? "bg-[var(--color-mint-400)]/70" : "bg-white/10"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="rounded-[2rem] border border-white/10 bg-[var(--color-cream-50)] text-[var(--color-green-950)] shadow-[0_30px_100px_rgba(0,0,0,0.26)]">
            <div className="border-b border-black/8 px-6 py-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--color-copper-500)]">
                Detail panel
              </p>
              <div className="mt-4 flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-green-900)] text-sm font-semibold text-[var(--color-mint-300)]">
                  {selectedPerson.initials}
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{selectedPerson.name}</h2>
                  <p className="mt-1 text-sm text-[var(--color-stone-700)]">
                    {selectedPerson.role}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--color-stone-700)]">
                {selectedPerson.summary}
              </p>
            </div>

            <div className="grid gap-5 px-6 py-5">
              <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                  Grundinfo
                </p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl bg-[var(--color-cream-100)] p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-stone-700)]">
                      Roll
                    </p>
                    <p className="mt-2 text-sm font-medium">{selectedPerson.role}</p>
                  </div>
                  <div className="rounded-2xl bg-[var(--color-cream-100)] p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-stone-700)]">
                      Om personen
                    </p>
                    <p className="mt-2 text-sm leading-6">{selectedPerson.summary}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                  Anteckningar
                </p>
                <div className="mt-4 grid gap-3">
                  {selectedPerson.notes.length > 0 ? (
                    selectedPerson.notes.map((note) => (
                      <article key={note.id} className="rounded-2xl bg-[var(--color-cream-100)] p-3">
                        <p className="text-sm leading-6">{note.content}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--color-stone-700)]">
                          {note.createdAt}
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

              <section className="rounded-[1.5rem] border border-black/8 bg-white p-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-500)]">
                  Filer
                </p>
                <div className="mt-4 grid gap-3">
                  {selectedPerson.files.length > 0 ? (
                    selectedPerson.files.map((file) => (
                      <article key={file.id} className="rounded-2xl bg-[var(--color-cream-100)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{file.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--color-stone-700)]">
                              {file.meta}
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--color-copper-500)]">
                            mock
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--color-stone-700)]">
                          {file.comment}
                        </p>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-black/10 p-4 text-sm text-[var(--color-stone-700)]">
                      Inga filer ännu.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
