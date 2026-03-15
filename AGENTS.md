# AGENTS.md

## Purpose
This repository currently contains the product and delivery plan for Modul 1 of a SaaS product for team structure and visual organization. Treat `PLAN.md` as the primary source of truth for scope and product intent.

## Current Project State
- Full Next.js 16 application with workspace, team, person, challenge, pattern, and CRM features.
- AI pipeline v4 is default for local provider (embedding-first, 95% deterministic). v3 is available as fallback. Old v1/v2 pipelines and local-*.ts variants have been deleted.
- Product is domain-agnostic — works for support tickets, HR, phone statistics, meeting notes, or any structured complaint data.
- Do not invent product scope outside what is documented in `PLAN.md` unless explicitly requested.

## Product Summary
- Target users: managers and team leads
- Core experience: workspace -> canvas -> team containers -> person cards -> meeting capture -> pattern detection
- Product type: team problem radar — captures challenges, detects patterns with AI, correlates with CRM data
- Canvas model: semi-structured, not fully freeform
- View modes: canvas, meeting, patterns, crm, history

## Scope Guardrails
- Build for desktop/laptop first. Mobile support is out of scope for Modul 1.
- `Person` is not the same concept as authenticated `Account`.
- AI pipeline v4 is the default for local analysis. Cloud (Anthropic) requires explicit opt-in due to data privacy.
- No real-time collaboration, no advanced file management, no dashboards.
- Prefer explicit exclusions from section `K` in `PLAN.md` over optimistic assumptions.

## Technical Baseline
- Framework: Next.js 16 (App Router), React 19
- Styling: Tailwind 4 with CSS variables for theme tokens
- Database: PostgreSQL (Neon) via Prisma 7 with `@prisma/adapter-pg`
- Auth: Demo mode (`demo-account-001`), NextAuth.js planned
- AI: v4 pipeline (local, embedding-first), Ollama for optional title polish, Anthropic API for cloud
- Deployment target: Vercel

## Architecture Expectations
- Keep domain boundaries clear:
  - auth/account
  - workspaces
  - teams
  - persons
  - challenges and patterns
  - AI pipeline (`lib/ai/`)
  - CRM integrations (`lib/crm/`)
- Persist structural state in the database:
  - team canvas position
  - person membership and position within a team
  - challenges, patterns, tags, suggestions
- Keep ephemeral UI state in the client:
  - open panel
  - zoom level
  - temporary drag state
  - onboarding step state

## UX Expectations
- Preserve the dark green premium direction from `PLAN.md`.
- Use warm neutral surfaces against a dark canvas for contrast.
- Detail editing should favor autosave over explicit save buttons.
- Empty states and onboarding are first-class work, not polish.

## Implementation Rules
- The project scaffold, schema, CRUD, canvas, and AI pipeline are already built.
- Prefer incremental vertical slices over broad unfinished scaffolding.
- Keep components specific until repetition proves extraction is worth it.
- Avoid introducing a full design system early.
- All UI text must be in Swedish. Code, comments, and commit messages in English.

## Data Modeling Notes
- `Workspace` owns `Team` and `Person`.
- Team-to-person relation is many-to-many through `TeamMembership`.
- `Challenge` belongs to `Person` and optionally to a `MeetingSession`.
- `Pattern` links to challenges via `PatternChallenge`. `Suggestion` is AI-generated advice per pattern.
- `Tag` via `ChallengeTag` for challenge categorization.
- `HistoricalImport` tracks imported batches.
- `CrmConnection` and `CrmSnapshot` for CRM integrations.
- Deletion flows must respect GDPR expectations and cascade related data.

## Testing Priorities
- Verify main flow early:
  - sign in
  - create workspace/team
  - add person
  - capture challenges in meeting view
  - run AI analysis (local v4 pipeline)
  - view detected patterns with priority ranking
- Prefer realistic test data volumes over toy examples.
- Eval scripts: `scripts/eval-real-data-v4.ts`, `scripts/stress-test-v4.ts`.

## File Priority
- `PLAN.md`: canonical product plan
- `STATUS.md`: current execution status and next actions
- `README.md`: contributor-facing overview
- `.env.example`: expected environment variables

## When Unsure
- Choose the simpler implementation if it preserves the Modul 1 intent.
- Do not build Miro-like free canvas behavior unless the user explicitly changes scope.

<!-- cortex:auto:start -->
## Cortex Auto Workflow
- Use `cortex todo "<task>"` for every new implementation task.
- Use `cortex note "<title>" "<details>"` when an important decision is made.
- Run `cortex update` before completing substantial code changes.
- Use `cortex plan` to inspect current progress and next command.
- If background sync is enabled, check with `cortex watch status`.
<!-- cortex:auto:end -->
