const features = [
  {
    label: "Mötesinspelning",
    title: "Fånga utmaningar i realtid",
    body: "Dokumentera teamets problem under veckomötet. Klicka på en person, skriv utmaningen, tryck Enter. Ingen friktion.",
  },
  {
    label: "Mönsterigenkänning",
    title: "Hitta det som upprepas",
    body: "AI analyserar utmaningar över tid och personer. Återkommande problem lyfts automatiskt — innan de blir kriser.",
  },
  {
    label: "CRM-koppling",
    title: "Koppla känsla till data",
    body: "Länka mönster till riktiga supportärenden från Freshdesk, Zendesk eller HubSpot. Se om teamets magkänsla stämmer.",
  },
];

const steps = [
  { num: "01", text: "Bygg dina team i canvasen" },
  { num: "02", text: "Fånga utmaningar i veckomötet" },
  { num: "03", text: "AI hittar mönster åt dig" },
  { num: "04", text: "Agera på det som faktiskt spelar roll" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(91,191,160,0.20),transparent_28%),linear-gradient(180deg,#102a24_0%,#0a1f1a_52%,#081612_100%)] text-[var(--color-cream-50)]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 pb-16 pt-8 md:px-10 lg:px-12">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Mönster
            </h1>
          </div>
          <a
            className="rounded-full border border-[var(--color-mint-400)]/30 bg-[var(--color-mint-400)]/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-[var(--color-mint-300)] transition hover:bg-[var(--color-mint-400)]/20"
            href="/workspace"
          >
            Öppna workspace
          </a>
        </header>

        {/* Hero */}
        <section className="grid flex-1 items-center gap-14 py-14 lg:grid-cols-[1.2fr_0.8fr] lg:py-20">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--color-mint-300)]">
              För teamledare som vill se mönster
            </p>
            <h2 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.05em] text-white md:text-7xl">
              Se vad ditt team hanterar men aldrig adresserar.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--color-cream-100)]/78 md:text-lg">
              Fånga utmaningar under veckomöten, hitta mönster med AI
              och koppla dem till riktig CRM-data. 100% lokalt — din data
              lämnar aldrig din maskin.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <a
                className="inline-flex items-center rounded-full bg-[var(--color-mint-400)] px-5 py-3 text-sm font-semibold text-[var(--color-green-950)] transition hover:bg-[var(--color-mint-300)]"
                href="/workspace"
              >
                Kom igång
              </a>
            </div>
          </div>

          {/* Visual: mock radar */}
          <div className="relative">
            <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_top_right,rgba(196,149,106,0.20),transparent_35%)] blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)]">
              <div className="grid gap-3">
                {/* Pattern card */}
                <div className="rounded-[1.25rem] border border-[var(--color-copper-400)]/20 bg-[var(--color-copper-400)]/8 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-copper-400)]">
                        Återkommande mönster
                      </p>
                      <p className="mt-2 text-base font-semibold text-white">
                        Oklara ansvarsområden vid kundöverlämning
                      </p>
                    </div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-copper-400)]/15 font-mono text-xs text-[var(--color-copper-200)]">
                      7×
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-[var(--color-cream-100)]/70">
                      3 personer
                    </span>
                    <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-[var(--color-cream-100)]/70">
                      5 möten
                    </span>
                    <span className="rounded-full bg-[var(--color-copper-400)]/15 px-3 py-1 text-xs text-[var(--color-copper-200)]">
                      Eskalerande
                    </span>
                  </div>
                </div>

                {/* Meeting capture preview */}
                <div className="rounded-[1.25rem] border border-[var(--color-mint-400)]/18 bg-[rgba(247,246,244,0.08)] p-5">
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-mint-300)]">
                    Senaste mötet
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-mint-400)]/20 text-xs font-semibold text-[var(--color-mint-300)]">
                        AK
                      </span>
                      <p className="text-sm text-[var(--color-cream-100)]/80">
                        Kunden eskalerade utan att CS visste om det
                      </p>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-sky-400)]/20 text-xs font-semibold text-[var(--color-sky-400)]">
                        ML
                      </span>
                      <p className="text-sm text-[var(--color-cream-100)]/80">
                        Samma sak förra veckan — ingen vet vem som äger
                        överlämningen
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-white/10 py-14 lg:py-20">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-[var(--color-mint-300)]">
            Så funkar det
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {steps.map((step) => (
              <div
                key={step.num}
                className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
              >
                <p className="font-mono text-2xl font-semibold text-[var(--color-mint-400)]">
                  {step.num}
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--color-cream-100)]/82">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-white/10 py-14 lg:py-20">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-[1.5rem] border border-white/10 bg-black/10 p-6"
              >
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-copper-400)]">
                  {feature.label}
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {feature.title}
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--color-cream-100)]/72">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 pt-8 text-center">
          <p className="text-sm text-[var(--color-cream-100)]/50">
            Mönster — se mönstren ditt team missar.
          </p>
        </footer>
      </div>
    </main>
  );
}
