# Team Structure Canvas

Grundrepo för Modul 1 av en SaaS-produkt där chefer och teamledare bygger upp sin teamstruktur i en visuell arbetsyta.

## Status

Repo:t innehåller nu en deploybar Next.js-grund för webbappen samt projekt- och driftfiler.

Se följande filer först:
- `PLAN.md` för den låsta Modul 1-specen
- `STATUS.md` för nuläge och rekommenderad startordning
- `AGENTS.md` för repo-specifika arbetsregler
- `docs/GIT_WORKFLOW.md` för branch-, PR- och deployflöde
- `SECURITY.md` för regler kring hemligheter och frontend/backend-exponering

## Modul 1 i korthet

- Auth och session
- Workspace med flera team
- Semi-strukturerad canvas
- Personkort som kan organiseras inom och mellan team
- Sidopanel för grundinfo, anteckningar och filer
- Förberedd datamodell för framtida AI- och samarbetsfunktioner

## Kom igång lokalt

```bash
nvm use                       # pinnar till Node 24
pnpm install
cp .env.example .env.local    # fyll i DATABASE_URL (se nedan)
pnpm db:generate
pnpm db:push                  # skapar tabeller i databasen
pnpm dev
```

Öppna `http://localhost:3000`. Health-check finns på `http://localhost:3000/api/health`.
Produktvyn finns på `http://localhost:3000/workspace`.

### Databas

Appen kräver en PostgreSQL-databas. Enklast är att skapa ett gratis projekt på [Neon](https://neon.tech) och klistra in anslutningssträngen som `DATABASE_URL` i `.env.local` och `.env`.

En demo-account (`demo-account-001`) behöver seedas i databasen:

```sql
INSERT INTO "Account" (id, email, name, "createdAt", "updatedAt")
VALUES ('demo-account-001', 'demo@worktemp.app', 'Demo User', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
```

Vid första besök på `/workspace` skapas en ny arbetsyta automatiskt. Riktig auth (NextAuth.js) planeras i nästa steg.

Repo:t är pinnat till Node `24.14.0` via `.nvmrc` och `.node-version` eftersom Prisma 7 inte stöder Node 25.

## Tekniska beslut från planen

- Next.js App Router
- Tailwind CSS
- Prisma + PostgreSQL
- NextAuth.js
- Zustand
- `@dnd-kit`
- Framer Motion
- S3-kompatibel fillagring via presigned URLs
- Deploy till Vercel

## Beslutat scope för Modul 1

Den definitiva produktgränsen finns i `PLAN.md`. Viktiga beslut som redan är låsta:
- semi-fri canvas, inte fri whiteboard
- teamyta, inte klassisk org chart
- `Account` och `Person` är separata entiteter
- anteckningar och filkommentarer är rå input, inte analyserad data
- inga dashboards, trender eller AI-insikter i denna modul

## Designriktning

Produkten ska luta mot en mörkgrön premium-estetik med varm neutralt tonade ytor. Undvik generisk SaaS-look och håll fast vid kontrasten mellan mörk canvas och ljusa kort.

## Scopegränser för Modul 1

Ingår inte:
- AI-analys
- dashboard/KPIer
- realtidssamarbete
- mobilanpassning
- avancerad filhantering
- integrationer

## Nästa praktiska steg

Följ implementation order i `PLAN.md` och håll `STATUS.md` uppdaterad när faktiska beslut eller avvikelser uppstår.

## CI/CD

Repo:t har nu GitHub Actions för:
- CI på PR och push till `main`
- preview-deploy till Vercel på PR när appen finns
- production-deploy till Vercel på push till `main`

Deploy-workflows skippar rent om Vercel-secrets ännu inte är satta.

## Appens rutter

- `/` — produkt-/projektlandning
- `/workspace` — fungerande MVP med team, personer, anteckningar och databaspersistens
- `/api/health` — health endpoint
- `/api/workspaces` — workspace CRUD
- `/api/teams` — team CRUD
- `/api/persons` — person CRUD med anteckningar och teamflytt
