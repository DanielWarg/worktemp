# STATUS

## Nuläge

- `PLAN.md` genomläst och används som källplan
- Projektets grundfiler skapade
- Ingen kodbas eller app-scaffold finns ännu

## Etablerade antaganden

- Modul 1 byggs för desktop/laptop
- `Person` och `Account` hålls separata
- Canvasen ska vara semi-strukturerad
- Filuppladdning hålls enkel i första versionen
- AI-funktioner förbereds i datamodellen men exponeras inte

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

## Definition av redo

Projektet är redo för implementation när:
- appen är scaffoldad
- miljövariabler är definierade
- Prisma-schema finns
- första layouten renderar
- auth och databas kan startas lokalt
