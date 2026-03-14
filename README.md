# Team Problem Radar

Captures challenges during team meetings, detects patterns with AI, and correlates with CRM data. Built for Swedish public transport (HPTS/Hogia) but generalizable.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 · PostgreSQL (Neon) · Tailwind 4

## AI Pipeline

4-step analysis: **normalize** → **auto-tag** → **detect-patterns** → **suggest**

Two providers:
- **Cloud:** Claude Sonnet 4 via Anthropic API
- **Local:** Ministral 14B via llama.cpp (offline-first, port 8081)

### Semantic Clustering

Pattern detection uses Transformers.js embeddings (`all-MiniLM-L6-v2`) to group challenges by similarity before sending to the LLM. This replaces naive chronological batching and produces significantly better results:

| | Semantic | Chronological |
|--|----------|---------------|
| Coverage | 73% | 58% |
| Patterns | 46 | 24 |
| Duplicates | 0 | 2 |
| Max pattern size | 16 | 48 (catch-all) |

Clustering parameters (in `lib/ai/cluster-challenges.ts`):
- `TARGET_MIN=20`, `TARGET_MAX=40` — cluster size range
- `SIMILARITY_THRESHOLD=0.30` — cosine similarity cutoff
- `MIN_CLUSTER=5` — minimum viable cluster

A refine step (AI self-critique + code-based dedup) runs after detection to merge overlapping patterns.

### Cortex MCP

Local knowledge graph (`mcp/`) indexes the codebase and provides semantic search, graph-weighted ranking, and context for AI analysis.

## Getting Started

```bash
pnpm install
cp .env.example .env.local    # Add DATABASE_URL and ANTHROPIC_API_KEY
pnpm db:generate
pnpm db:push
pnpm dev
```

A demo account (`demo-account-001`) needs to exist in the database:

```sql
INSERT INTO "Account" (id, email, name, "createdAt", "updatedAt")
VALUES ('demo-account-001', 'demo@worktemp.app', 'Demo User', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
```

Open `http://localhost:3000/workspace` for the app.

### Local AI (optional)

```bash
# Start Ministral 14B
llama-server -m ~/.cache/models/Ministral-3-14B-Instruct-2512-Q4_K_M.gguf --port 8081 -ngl 99

# Run eval
npx tsx scripts/eval-real-data.ts              # Semantic clustering
npx tsx scripts/eval-real-data.ts --no-cluster  # Chronological baseline
```

## Project Structure

```
app/                    Pages and ~32 REST API routes
components/workspace/   UI components (workspace-shell.tsx is main container)
lib/ai/                 AI pipeline (cloud + local variants)
  cluster-challenges.ts Agglomerative semantic clustering
  embed-challenges.ts   Transformers.js embeddings (384-dim)
  detect-patterns.ts    Claude pattern detection
  local-*.ts            Ministral/local variants
lib/crm/                Freshdesk/Zendesk/HubSpot adapters
lib/db/                 Prisma singleton (@prisma/adapter-pg)
mcp/                    Cortex MCP server (knowledge graph)
scripts/                Eval pipeline, ingestion, context tools
generated/prisma/       Auto-generated Prisma client
```

## Key Models

`Workspace` → `Team` → `Person` → `Challenge` → `Tag` (via `ChallengeTag`)

`Pattern` links to challenges via `PatternChallenge`. `Suggestion` is AI-generated advice per pattern. `HistoricalImport` tracks imported batches.

## Routes

- `/` — Landing page
- `/workspace` — Main app (canvas, meeting, patterns, CRM, history views)
- `/api/ai/analyze` — AI pipeline endpoint
- `/api/health` — Health check
- `~32 REST API routes` for workspaces, teams, persons, challenges, patterns, tags, CRM

## Conventions

- **UI language:** Swedish
- **Code/commits:** English
- **Auth:** Demo mode (`demo-account-001`), NextAuth planned
- **Desktop-first**, no real-time collaboration
- **Dark green premium theme** with Tailwind 4 CSS variables
