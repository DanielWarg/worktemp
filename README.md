# Team Problem Radar

Captures challenges during team meetings, detects patterns with AI, and correlates with CRM data. Domain-agnostic — works for support tickets, HR, phone statistics, meeting notes, or any structured complaint data.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 · PostgreSQL (Neon) · Tailwind 4

## AI Pipeline

Two providers:
- **Local (default):** v4 pipeline — 95% deterministic, fully offline. Optional title polish via Qwen2.5-7B on Ollama.
- **Cloud:** Claude Sonnet 4 via Anthropic API (requires explicit opt-in due to data privacy).

### v4 Pipeline Flow

```
Filter → Embed → Cluster → Topic Extract → Dedup → Metadata → Title Polish
```

1. **Filter** — pre-classify tickets + deduplicate
2. **Embed** — multilingual sentence embeddings (paraphrase-multilingual-MiniLM-L12-v2, 384-dim)
3. **Cluster** — agglomerative clustering with hard max cap (12 tickets)
4. **Topic Extract** — n-gram TF-IDF, domain-agnostic (replaces entity extraction)
5. **Pattern Dedup** — dual signal: centroid similarity + topic Jaccard overlap
6. **Metadata** — org-based scope, trend from dates, confidence scoring
7. **Title Polish** — optional LLM call via Ollama (Qwen2.5-7B)

Performance: ~2s deterministic, ~50s with title polish (M4 Pro, 265 tickets → 35 patterns).

### Cortex MCP

Local knowledge graph (`mcp/`) indexes the codebase and provides semantic search and context for AI analysis.

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
# Start Ollama with Qwen2.5-7B for title polish
ollama run qwen2.5:7b

# Run eval
npx tsx scripts/eval-real-data-v4.ts              # Deterministic only
npx tsx scripts/eval-real-data-v4.ts --sweep       # Threshold sweep
npx tsx scripts/eval-real-data-v4.ts --polish qwen2.5-7b  # With title polish
npx tsx scripts/stress-test-v4.ts                  # Stress test (HR, phone, IT, mixed)
```

## Project Structure

```
app/                    Pages and ~32 REST API routes
components/workspace/   UI components (workspace-shell.tsx is main container)
lib/ai/                 AI pipeline
  pattern-detect-v4.ts  v4 orchestrator (default)
  pattern-detect-v3.ts  v3 orchestrator (fallback)
  embed-challenges.ts   Multilingual sentence embeddings
  cluster-challenges.ts Agglomerative clustering
  topic-extract.ts      N-gram TF-IDF topic extraction
  pattern-dedup.ts      Dual-signal pattern deduplication
  trend-calc.ts         Trend, scope, confidence scoring
  title-polish.ts       LLM title polish (Ollama)
  pre-classify.ts       Ticket classification + noise filter
lib/crm/                Freshdesk/Zendesk/HubSpot adapters
lib/db/                 Prisma singleton (@prisma/adapter-pg)
mcp/                    Cortex MCP server (knowledge graph)
scripts/                Eval and stress test scripts
generated/prisma/       Auto-generated Prisma client
```

## Key Models

`Workspace` → `Team` → `Person` → `Challenge` → `Tag` (via `ChallengeTag`)

`Pattern` links to challenges via `PatternChallenge`. `Suggestion` is AI-generated advice per pattern. `HistoricalImport` tracks imported batches.

## Conventions

- **UI language:** Swedish
- **Code/commits:** English
- **Auth:** Demo mode (`demo-account-001`), NextAuth planned
- **Desktop-first**, no real-time collaboration
- **Dark green premium theme** with Tailwind 4 CSS variables
