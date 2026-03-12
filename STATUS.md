# STATUS

## Nuläge

- `PLAN.md` omskriven till låst och skarpare Modul 1-spec
- Projektets grundfiler skapade
- Next.js 16-app med fungerande MVP: workspace, team, person, anteckningar
- Prisma 7 kopplad mot Neon PostgreSQL med alla Modul 1-tabeller
- REST API-lager med full CRUD för workspace, team, person, notes
- Frontend hämtar och skriver data via API (inte localStorage)
- Demo-auth med fast account-id (riktig auth planeras i nästa steg)
- GitHub-repo finns på `https://github.com/DanielWarg/worktemp`
- CI/CD-grund är tillagd via GitHub Actions
- Repo-säkerhet är förstärkt med secret-guardrails, PR-mall och workflow-dokumentation
- GitHub-repoinställningar är delvis konfigurerade direkt remote

## Etablerade antaganden

- Modul 1 byggs för desktop/laptop
- `Person` och `Account` hålls separata
- Canvasen ska vara semi-strukturerad
- Filuppladdning hålls enkel i första versionen
- AI-funktioner förbereds i datamodellen men exponeras inte
- Vercel används som deploy-mål när appen scaffoldats
- Vercel används som deploy-mål för den nya Next.js-appen
- GitHub Actions är primär CI/CD-motor
- Modul 1 är en teamyta, inte en klassisk org chart
- All rå input i anteckningar och filkommentarer ska behandlas som framtidsredo men oprocessad data
- Repo:t ska köras på Node 24, inte Node 25

## Låsta produktbeslut

- teamcontainrar är huvudobjektet i canvasen
- personkort lever inom teamcontainrar och bär bara lätt information på canvas
- detalj och kontext hör hemma i sidopanelen
- fri whiteboard-logik är uttryckligen exkluderad
- analys, trendning och kategorisering byggs inte i Modul 1
- filhantering ska hållas smal: upload + metadata + kommentar

## Implementerat i repo:t

- `app/`
  - App Router-grund med startsida, layout, workspace-shell och globala stilar
- `app/api/health/route.ts`
  - enkel health endpoint för deployverifiering
- `app/api/workspaces/` — workspace list och create, workspace detail med full team/person/note-graf
- `app/api/teams/` — team create, update, delete
- `app/api/persons/` — person create, update, delete, move mellan team, notes
- `lib/auth.ts` — demo-auth helper (fast account-id)
- `components/workspace/workspace-shell.tsx`
  - interaktiv workspace-vy med API-driven state (ej localStorage)
- `package.json`
  - Next.js 16, React 19, Tailwind 4, TypeScript, Prisma och ESLint
- `.nvmrc`, `.node-version`
  - låser repo:t till Node 24.14.0
- `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`
  - bygg- och lintkonfiguration för webbappen
- `prisma/schema.prisma`
  - Modul 1-datamodell för account, workspace, team, person, membership, note, attachment och attachment comment
- `prisma.config.ts`
  - Prisma 7-konfiguration mot PostgreSQL
- `lib/db/prisma.ts`
  - server-side Prisma-klient via `@prisma/adapter-pg`
- `.github/workflows/ci.yml`
  - kör `repo-hygiene` och `node-ci`
- `.github/workflows/deploy-preview.yml`
  - förberedd preview-deploy till Vercel på PR
- `.github/workflows/deploy-production.yml`
  - förberedd production-deploy till Vercel på `main`
- `scripts/ci/validate-no-secrets.sh`
  - blockerar vanliga läckor och förbjudna filer
- `scripts/ci/run-node-checks.sh`
  - kör install/lint/typecheck/test/build när appen finns
- `.github/pull_request_template.md`
  - tvingar checklista för säkerhet och handoff
- `.github/CODEOWNERS`
  - sätter ägarskap för repo:t
- `docs/GIT_WORKFLOW.md`
  - beskriver branch-strategi, merge-regler och deployflöde
- `SECURITY.md`
  - dokumenterar hur hemligheter ska hanteras

## CI/CD-beteende just nu

- CI kör redan på PR och push till `main`
- CI kör nu riktiga Node-baserade steg när lockfil och dependencies finns
- Deploy-workflows skippar rent om Vercel-secrets inte är satta ännu
- För deploy krävs GitHub-secrets:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`

## Verifierat lokalt

- `pnpm install`
- `npx -y node@24 ./node_modules/prisma/build/index.js validate`
- `npx -y node@24 ./node_modules/prisma/build/index.js generate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm start`
- `GET /api/health` returnerar `200` och JSON
- `GET /workspace` returnerar `200`

## Prisma-status

- Prisma 7.4.2 används
- klienten genereras till `generated/prisma`
- repo:t kräver Node 24 för Prisma-kommandon
- ingen migration är körd ännu eftersom ingen faktisk databas är kopplad i detta steg

## Frontendfunktioner som finns nu

- skapa nya team direkt i workspace-vyn
- byta namn på team inline
- skapa nya personkort per team
- välja personkort och öppna detaljpanelen
- redigera namn, roll och beskrivning för vald person
- lägga till anteckningar lokalt i detaljpanelen
- flytta vald person mellan team från detaljpanelen
- ta bort vald person
- lokal persistens i webbläsaren så arbetsytan överlever refresh
- tomma tillstånd för team utan personer och när ingen person är vald
- UX-copy och exempeldata är nu mer inriktade på teamstruktur, ansvar och ledningsarbete än på generisk demo-data

## Viktig status om frontendkoden

- nuvarande `/workspace` ska behandlas som explorativ implementation, inte som slutligt låst produktbeteende
- vidare implementation ska nu styras av den nya specifikationen i `PLAN.md`
- om befintlig frontend avviker från spec ska spec vinna och UI:t justeras därefter

## GitHub-inställningar som redan är applicerade

- `main` är branch-protected
- Obligatoriska checks:
  - `repo-hygiene`
  - `node-ci`
- PR-krav:
  - minst 1 approval
  - code owner review krävs
  - stale reviews avfärdas vid ny push
  - conversations måste vara lösta
- Historik:
  - linear history krävs
  - force push är avstängt
  - branch delete är avstängt
- Merge policy:
  - squash merge tillåtet
  - merge commits avstängda
  - rebase merge avstängt
  - branch raderas automatiskt efter merge
- Säkerhetsfunktioner:
  - GitHub secret scanning är aktiverat
  - GitHub push protection är aktiverat
  - Dependabot security updates är aktiverat

## Repo policy att behålla

- `main` ska vara skyddad
- Allt arbete ska gå via branch + PR
- Squash merge är önskat defaultflöde
- `STATUS.md` ska uppdateras när arkitektur, workflow eller driftförutsättningar ändras
- Om branch protection eller GitHub-secrets ändras ska det dokumenteras här direkt

## Rekommenderad startsekvens

Se implementation order i `PLAN.md`. Den är nu den primära källan för byggordning.

## Öppna beslut som kan tas senare

- Exakt auth-provider-konfiguration
- Om PostgreSQL körs lokalt först eller direkt mot Neon
- Om filstorage ska vara AWS S3, Cloudflare R2 eller annan S3-kompatibel tjänst
- Om preview-deploy även ska kommentera URL tillbaka till PR
- Om Dependabot ska aktiveras för npm efter att appen scaffoldats

## Nästa byggsteg

- Lägga till auth-flöde med NextAuth.js (ersätta demo-account)
- Bygga filuppladdning (presigned URL till S3/R2)
- Bygga filkommentarer
- Lägga till drag-and-drop för personkort och teamcontainrar
- Polera onboarding-flöde (tomma tillstånd, guidning)
- Lägga till autosave-debounce på inline-redigering

## Definition av redo

Projektet är redo för implementation när:
- appen är scaffoldad
- miljövariabler är definierade
- Prisma-schema finns
- första layouten renderar
- auth och databas kan startas lokalt
