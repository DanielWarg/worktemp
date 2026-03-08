# AGENTS.md

## Purpose
This repository currently contains the product and delivery plan for Modul 1 of a SaaS product for team structure and visual organization. Treat `PLAN.md` as the primary source of truth for scope and product intent.

## Current Project State
- No application scaffold exists yet.
- Work in this repository should first establish implementation-ready foundations.
- Do not invent product scope outside what is documented in `PLAN.md` unless explicitly requested.

## Product Summary
- Target users: managers and team leads
- Core experience: workspace -> canvas -> team containers -> person cards -> right-side detail panel
- Product type: structure tool, not HR analytics, not KPI dashboard
- Canvas model: semi-structured, not fully freeform

## Scope Guardrails
- Build for desktop/laptop first. Mobile support is out of scope for Modul 1.
- `Person` is not the same concept as authenticated `Account`.
- No AI features in Modul 1 beyond data-model preparation hooks.
- No real-time collaboration, no advanced file management, no dashboards.
- Prefer explicit exclusions from section `K` in `PLAN.md` over optimistic assumptions.

## Technical Baseline
- Framework: Next.js App Router
- Styling: Tailwind CSS with CSS variables for theme tokens
- State: Zustand
- Drag and drop: `@dnd-kit`
- Animation: Framer Motion
- Auth: NextAuth.js
- Database: PostgreSQL via Prisma
- Storage: S3-compatible object storage using presigned upload URLs
- Deployment target: Vercel

## Architecture Expectations
- Keep domain boundaries clear:
  - auth/account
  - workspaces
  - teams
  - persons
  - notes
  - attachments
- Persist structural state in the database:
  - team canvas position
  - person membership and position within a team
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
- Start with foundations in this order unless a task says otherwise:
  1. project scaffold
  2. theme tokens and layout shell
  3. Prisma schema
  4. auth/session flow
  5. workspace/team/person CRUD
  6. canvas interactions
  7. detail panel
  8. uploads and tests
- Prefer incremental vertical slices over broad unfinished scaffolding.
- Keep components specific until repetition proves extraction is worth it.
- Avoid introducing a full design system early.

## Data Modeling Notes
- `Workspace` owns `Team` and `Person`.
- Team-to-person relation is many-to-many through membership.
- Design for future extensibility:
  - optional `account_id` on `Person`
  - future tags/status models
  - future collaboration models
- Deletion flows must respect GDPR expectations and cascade related data.

## Testing Priorities
- Verify main flow early:
  - sign in
  - create workspace/team
  - add person
  - open and edit detail panel
  - move person between teams
- Prefer realistic test data volumes over toy examples.

## File Priority
- `PLAN.md`: canonical product plan
- `STATUS.md`: current execution status and next actions
- `README.md`: contributor-facing overview
- `.env.example`: expected environment variables

## When Unsure
- Choose the simpler implementation if it preserves the Modul 1 intent.
- Do not build Miro-like free canvas behavior unless the user explicitly changes scope.
