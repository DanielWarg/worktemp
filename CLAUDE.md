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
- `lib/ai/` — Two AI pipelines:
  - **v3 (default for local):** Embedding-first, 95% deterministic. `pattern-detect-v3.ts` orchestrates: pre-classify → embed → cluster → entity-extract → sub-split → metadata → title-polish (Qwen2.5-7B via Ollama). No LLM needed for core analysis.
  - **v1 (Claude API):** 4-step LLM pipeline: normalize → auto-tag → detect-patterns → suggest. Each step has `local-*.ts` variant.
- `lib/db/prisma.ts` — Prisma singleton using `@prisma/adapter-pg` (not the default engine).
- `lib/crm/` — Freshdesk/Zendesk/HubSpot adapters.
- `generated/prisma/` — Auto-generated Prisma client (import from `@/generated/prisma/client`).

### Data flow

WorkspaceShell owns state and passes it down. Child components call `api()` helper (in `components/workspace/helpers.ts`) for mutations, then parent calls `reload()` to refetch. No client-side state library — all persistence goes through API → Prisma → Neon.

### Key domain models

`Workspace` → `Team` → `TeamMembership` → `Person` → `Challenge` → `Tag` (via `ChallengeTag`). `Pattern` links to challenges via `PatternChallenge`. `HistoricalImport` tracks imported batches. `Suggestion` is AI-generated advice per pattern.

### AI pipeline

`POST /api/ai/analyze` with `{ workspaceId, steps[], provider, pipelineVersion? }`. Two providers:
- `local` (default) → v3 pipeline. Single step "patterns". Embedding + entity extraction + clustering (deterministic, ~2s). Optional title polish via Qwen2.5-7B on Ollama port 11434 (~16s extra). Falls back to deterministic titles if Ollama unavailable.
- `anthropic` → v1 pipeline. Four steps: normalize → tag → patterns → suggestions. Uses Claude Sonnet 4.

Key v3 files: `pattern-detect-v3.ts` (orchestrator), `entity-extract.ts` (domain-agnostic), `sub-split.ts` (catch-all prevention), `trend-calc.ts` (scope/trend/confidence), `title-polish.ts` (LLM strategies).

## Conventions

- **Language:** All UI text is Swedish. Variable names, code comments, and commit messages in English.
- **Styling:** Tailwind 4 with CSS variables (`--color-mint-400`, `--color-copper-500`, `--color-green-950`, etc.) defined in `globals.css`. Dark green premium theme.
- **Auth:** Demo mode — `lib/auth.ts` returns hardcoded `"demo-account-001"`. NextAuth planned for later.
- **API routes:** `NextResponse.json()` returns. Query params for reads, JSON body for writes. Prisma transactions for cascading deletes.
- **Person vs Account:** `Person` is a team member being tracked. `Account` is an authenticated user. They can optionally link via `accountId`.
- **Scope:** `PLAN.md` is the source of truth. Desktop-first. No real-time collab. No free-form canvas (semi-structured layout).
