const pillars = [
  {
    title: "Visualisera team",
    body: "Bygg upp team i en semistrukturerad canvas som känns fri men fortfarande går att hålla konsekvent och snabb.",
  },
  {
    title: "Dokumentera personer",
    body: "Lagra roll, anteckningar och filer i en sidopanel utan att blanda ihop personkort med inloggade användare.",
  },
  {
    title: "Förbered för skalning",
    body: "Datamodellen och CI/CD-grunden är lagd för Prisma, auth, drag-and-drop och framtida AI-hooks.",
  },
];

const deliverySteps = [
  "App Router + Tailwind 4 + TypeScript",
  "Deploybar på Vercel via GitHub Actions",
  "Health endpoint för driftkontroll",
  "Säkerhetsguardrails för hemligheter i klient och server",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(91,191,160,0.20),transparent_28%),linear-gradient(180deg,#102a24_0%,#0a1f1a_52%,#081612_100%)] text-[var(--color-cream-50)]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 pb-16 pt-8 md:px-10 lg:px-12">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--color-mint-300)]">
              Modul 1
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white">
              Team Structure Canvas
            </h1>
          </div>
          <div className="rounded-full border border-[var(--color-copper-400)]/30 bg-[var(--color-copper-400)]/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-copper-200)]">
            Deployklar grund
          </div>
        </header>

        <section className="grid flex-1 items-center gap-14 py-14 lg:grid-cols-[1.2fr_0.8fr] lg:py-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--color-mint-300)]">
              Workspace, team, personer
            </p>
            <h2 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.05em] text-white md:text-7xl">
              En webbappgrund för att bygga teamstruktur utan att läcka hemligheter.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--color-cream-100)]/78 md:text-lg">
              Repo:t är nu förberett för Vercel-deploy med Next.js 16, App Router,
              GitHub Actions, branch protection och guardrails som stoppar vanliga
              secret-läckor innan de når produktion.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <a
                className="inline-flex items-center rounded-full bg-[var(--color-mint-400)] px-5 py-3 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)]"
                href="/workspace"
              >
                Öppna workspace-shell
              </a>
              <a
                className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                href="/api/health"
              >
                Kolla health endpoint
              </a>
            </div>

            <ul className="mt-12 grid gap-4 md:grid-cols-2">
              {deliverySteps.map((step) => (
                <li
                  key={step}
                  className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-[var(--color-cream-100)]/82 backdrop-blur-sm"
                >
                  {step}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_top_right,rgba(196,149,106,0.20),transparent_35%)] blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)]">
              <div className="grid gap-4">
                <div className="rounded-[1.5rem] border border-[var(--color-mint-400)]/18 bg-[rgba(247,246,244,0.08)] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Ledningsgrupp
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-cream-100)]/68">
                        Semistrukturerad teamcontainer
                      </p>
                    </div>
                    <span className="h-3 w-3 rounded-full bg-[var(--color-mint-400)]" />
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-[var(--color-surface-card)] p-4 text-[var(--color-green-950)] shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-copper-500)]">
                        DW
                      </p>
                      <p className="mt-3 text-base font-semibold">Daniel Warg</p>
                      <p className="mt-1 text-sm text-[var(--color-stone-700)]">
                        Team lead
                      </p>
                    </div>
                    <div className="rounded-2xl border border-dashed border-white/16 bg-white/5 p-4 text-sm text-[var(--color-cream-100)]/70">
                      Klickbar sidopanel
                      <div className="mt-3 h-2 rounded-full bg-white/10" />
                      <div className="mt-2 h-2 w-4/5 rounded-full bg-white/10" />
                      <div className="mt-5 text-xs uppercase tracking-[0.22em] text-[var(--color-mint-300)]">
                        Notes • Files • Metadata
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {pillars.map((pillar) => (
                    <article
                      key={pillar.title}
                      className="rounded-[1.5rem] border border-white/10 bg-black/10 p-5"
                    >
                      <p className="text-lg font-semibold text-white">
                        {pillar.title}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-[var(--color-cream-100)]/72">
                        {pillar.body}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
