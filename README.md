<h1 align="center">
  <br>
  MÖNSTER
  <br>
</h1>

<p align="center">
  <strong>See the patterns your team misses.</strong>
</p>

<p align="center">
  <em>Local-first AI pattern detection. Your data never leaves your machine.</em>
</p>

<p align="center">
  <code>capture → analyze → prioritize → act</code>
</p>

Mönster captures challenges during team meetings, detects recurring patterns with AI, and surfaces the problems that keep coming back — before they become crises.

Support tickets. HR complaints. Phone statistics. Meeting notes. If problems repeat, Mönster finds them.

### 100% local. Your data stays yours.

The entire AI pipeline runs on your machine. No API keys. No cloud dependency. No data leaves your hardware.

Want LLM-powered title polish? Run Ollama locally. Want cloud AI? Explicitly opt in. Your call.

---

## How it works

```
Capture  →  Analyze  →  Prioritize  →  Act
```

**Capture** — Record challenges during meetings. Click a person, type the issue, Enter. Zero friction.

**Analyze** — One button. Embeds, clusters, extracts topics, deduplicates, scores. 2 seconds. No LLM.

**Prioritize** — Critical bugs, escalating trends, cross-team issues rise to the top. Suspected duplicates get flagged — is this a bug or a misconfiguration?

**Act** — Each pattern gets a suggested action. Connect your CRM to validate gut feelings with real data.

---

## The pipeline

95% deterministic. Reproducible. Offline. The LLM is cosmetics.

```
Filter → Embed → Cluster → Topics → Dedup → Score → Polish
  50ms    3s      300ms     400ms    100ms    50ms   +16s (opt)
```

| Step | What | AI? |
|------|------|-----|
| **Filter** | Noise removal, batch-scoped dedup | No |
| **Embed** | Multilingual vectors (Swedish/English) | Local model |
| **Cluster** | Agglomerative, max 12 per group | No |
| **Topics** | N-gram TF-IDF, domain-agnostic | No |
| **Dedup** | Centroid similarity + topic overlap | No |
| **Score** | Trend, scope, confidence, priority | No |
| **Polish** | Title + suggestion via local LLM | Optional |

**265 tickets → 35 patterns → 2.0s.** With title polish: 50s.

Stress-tested across IT support, HR, phone stats, and meeting notes. 1000 tickets in 28s.

### Why local-first

Your team's problems are sensitive. They don't belong on someone else's server. Deterministic results mean you can trust and reproduce the analysis. Works offline. Works air-gapped. Cloud AI (Claude Sonnet 4) available as explicit opt-in for teams that want it.

---

## Stack

Next.js 16 · React 19 · TypeScript · Prisma 7 · PostgreSQL · Tailwind 4

## Quick start

```bash
pnpm install
cp .env.example .env.local    # Add DATABASE_URL
pnpm db:generate && pnpm db:push
pnpm dev
```

```sql
INSERT INTO "Account" (id, email, name, "createdAt", "updatedAt")
VALUES ('demo-account-001', 'demo@worktemp.app', 'Demo User', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
```

Open **http://localhost:3000/workspace**

### Local LLM (optional)

```bash
ollama run qwen2.5:7b    # Title polish + suggestions
```

Auto-detected on port 11434. Without it, deterministic titles work fine.

### Eval

```bash
npx tsx scripts/eval-real-data-v4.ts                        # Deterministic
npx tsx scripts/eval-real-data-v4.ts --polish qwen2.5-7b    # With polish
npx tsx scripts/stress-test-v4.ts                            # Multi-domain stress test
```

---

## Structure

```
app/                     Pages + API routes
components/workspace/    UI — canvas, meetings, patterns, CRM, history
lib/ai/                  The pipeline
  pattern-detect-v4.ts     Orchestrator
  embed-challenges.ts      Multilingual embeddings
  cluster-challenges.ts    Agglomerative clustering
  topic-extract.ts         TF-IDF topics
  pattern-dedup.ts         Dual-signal dedup
  trend-calc.ts            Scoring
  title-polish.ts          LLM polish
  pre-classify.ts          Noise filter
lib/crm/                 Freshdesk · Zendesk · HubSpot
lib/db/                  Prisma + PostgreSQL
```

## Data model

```
Workspace → Team → Person → Challenge → Tag
                                ↓
                           Pattern → Suggestion
                                ↓
                           CRM Evidence
```

---

*Mönster — se mönstren ditt team missar.*
