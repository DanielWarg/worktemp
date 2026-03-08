# Team Structure Canvas

Grundrepo för Modul 1 av en SaaS-produkt där chefer och teamledare bygger upp sin teamstruktur i en visuell arbetsyta.

## Status

Repo:t innehåller just nu planering och projektfiler. Applikationen är inte scaffoldad ännu.

Se följande filer först:
- `PLAN.md` för produkt- och leveransplan
- `STATUS.md` för nuläge och rekommenderad startordning
- `AGENTS.md` för repo-specifika arbetsregler

## Modul 1 i korthet

- Auth och session
- Workspace med flera team
- Semi-strukturerad canvas
- Personkort som kan organiseras inom och mellan team
- Sidopanel för grundinfo, anteckningar och filer
- Förberedd datamodell för framtida AI- och samarbetsfunktioner

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

## Rekommenderad implementationsordning

1. Scaffolda Next.js-projektet
2. Lägg in tema-tokens, layout och app shell
3. Modellera Prisma-schema och migreringar
4. Implementera auth och workspace-flöde
5. Bygg team/person CRUD
6. Bygg canvas och drag-and-drop
7. Bygg detaljpanel med autosave
8. Lägg till filuppladdning och tester

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

Skapa appen och börja med fundament enligt `STATUS.md`.
