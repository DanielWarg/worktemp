# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Dev server (Turbopack) — see caveat below
pnpm build            # Production build
pnpm start            # Production server (requires build first)
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check (tsc --noEmit)
pnpm db:generate      # Regenerate Prisma client after schema changes
pnpm db:migrate       # Run Prisma migrations
pnpm db:push          # Push schema to DB without migration
pnpm db:studio        # Visual DB browser
```

**Turbopack caveat:** `next dev` can hang if llama-server is running simultaneously (memory pressure on M4 Pro). If dev hangs, use `pnpm build && pnpm start` as workaround.

## Architecture

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 · PostgreSQL (Neon) · Tailwind 4

**Product:** Team Problem Radar — captures challenges during team meetings, detects patterns with AI, correlates with CRM data.

### Layout

- `app/` — Pages and ~32 REST API routes. Landing page at `/`, workspace app at `/workspace`.
- `components/workspace/` — All UI components. `workspace-shell.tsx` is the main container with view-mode state (`canvas | meeting | patterns | crm | history`).
- `lib/ai/` — 4-step AI pipeline: normalize → auto-tag → detect-patterns → suggest. Each step has a Claude variant and a `local-*.ts` variant for offline Ministral.
- `lib/db/prisma.ts` — Prisma singleton using `@prisma/adapter-pg` (not the default engine).
- `lib/crm/` — Freshdesk/Zendesk/HubSpot adapters.
- `generated/prisma/` — Auto-generated Prisma client (import from `@/generated/prisma/client`).

### Data flow

WorkspaceShell owns state and passes it down. Child components call `api()` helper (in `components/workspace/helpers.ts`) for mutations, then parent calls `reload()` to refetch. No client-side state library — all persistence goes through API → Prisma → Neon.

### Key domain models

`Workspace` → `Team` → `TeamMembership` → `Person` → `Challenge` → `Tag` (via `ChallengeTag`). `Pattern` links to challenges via `PatternChallenge`. `HistoricalImport` tracks imported batches. `Suggestion` is AI-generated advice per pattern.

### AI pipeline

`POST /api/ai/analyze` with `{ workspaceId, steps[], provider }`. Runs steps sequentially in batches. Each step has error counting (`failedBatches`) and the response includes `warnings[]`. Two providers: `anthropic` (Claude Sonnet 4) and `local` (Ministral via llama.cpp on port 8081).

## Conventions

- **Language:** All UI text is Swedish. Variable names, code comments, and commit messages in English.
- **Styling:** Tailwind 4 with CSS variables (`--color-mint-400`, `--color-copper-500`, `--color-green-950`, etc.) defined in `globals.css`. Dark green premium theme.
- **Auth:** Demo mode — `lib/auth.ts` returns hardcoded `"demo-account-001"`. NextAuth planned for later.
- **API routes:** `NextResponse.json()` returns. Query params for reads, JSON body for writes. Prisma transactions for cascading deletes.
- **Person vs Account:** `Person` is a team member being tracked. `Account` is an authenticated user. They can optionally link via `accountId`.
- **Scope:** `PLAN.md` is the source of truth. Desktop-first. No real-time collab. No free-form canvas (semi-structured layout).
