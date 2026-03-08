# STATUS

## Nuläge

- `PLAN.md` genomläst och används som källplan
- Projektets grundfiler skapade
- Minimal Next.js 16-app är scaffoldad och deploybar
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

## Implementerat i repo:t

- `app/`
  - App Router-grund med startsida, layout, workspace-shell och globala stilar
- `app/api/health/route.ts`
  - enkel health endpoint för deployverifiering
- `components/workspace/workspace-shell.tsx`
  - första klickbara produkt-UI med mockdata för team och personer
- `package.json`
  - Next.js 16, React 19, Tailwind 4, TypeScript och ESLint
- `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`
  - bygg- och lintkonfiguration för webbappen
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
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm start`
- `GET /api/health` returnerar `200` och JSON
- `GET /workspace` returnerar `200`

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

### Fas 1
- Initiera Next.js 14+ med App Router och TypeScript
- Installera Tailwind, Prisma, NextAuth, Zustand, `@dnd-kit`, Framer Motion
- Sätt upp design tokens från planen
- Sätt upp grundlayout med topbar och canvas-yta

### Fas 2
- Modellera Prisma-schema för:
  - `Account`
  - `Workspace`
  - `Team`
  - `Person`
  - `TeamMembership`
  - `Note`
  - `Attachment`
- Koppla mot PostgreSQL
- Förbered storage-konfiguration för presigned uploads

### Fas 3
- Implementera auth och sessionflöde
- Bygg workspace/team/person CRUD
- Lägg till första tomma tillstånd

### Fas 4
- Bygg canvasinteraktioner
- Bygg detaljpanelen
- Lägg till anteckningar, uppladdningar och tester

## Öppna beslut som kan tas senare

- Exakt auth-provider-konfiguration
- Om PostgreSQL körs lokalt först eller direkt mot Neon
- Om filstorage ska vara AWS S3, Cloudflare R2 eller annan S3-kompatibel tjänst
- Om preview-deploy även ska kommentera URL tillbaka till PR
- Om Dependabot ska aktiveras för npm efter att appen scaffoldats

## Nästa byggsteg

- Sätta upp Prisma-schema och första migrering
- Lägga till auth-flöde med NextAuth.js
- Bygga layout shell med topbar och canvas-yta
- Introducera första domänmodellerna för workspace, team och person
- Ersätta mockdata i `/workspace` med riktiga serverhämtade modeller

## Definition av redo

Projektet är redo för implementation när:
- appen är scaffoldad
- miljövariabler är definierade
- Prisma-schema finns
- första layouten renderar
- auth och databas kan startas lokalt
