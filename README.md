# Niche Pipeline

Single-user dashboard for a daily small-business idea agent. A local worker
process (`pnpm worker`) drives five routines — Generator, Researcher,
Validator, Planner, Post-mortem — using your Claude Code **Max plan** via
the official Agent SDK. The Next.js dashboard is the queue front-end: it
inserts `routine_runs` rows and the worker picks them up.

> Previously this app fired Claude Cloud Routines via API trigger tokens.
> That billed against Anthropic API credits, which got expensive fast. The
> worker rearchitecture (see [`docs/worker.md`](docs/worker.md)) moves all
> AI calls onto the Max plan instead.

## Local dev

```bash
cp .env.local.example .env.local
# fill in Supabase creds + the two API trigger URLs from your routines
pnpm install
pnpm dev
```

Open `http://localhost:3000?password=<DASHBOARD_PASSWORD>` (or remove `DASHBOARD_PASSWORD` to skip auth locally).

## Required setup before running

1. **Supabase project + schema** — run the SQL from the build kit (`ideas` + `feedback_patterns` + `routine_runs` + `pipeline_profile` tables, plus the `touch_updated_at` trigger).
2. **Log into Claude Code on Max.** The worker reads your OAuth session from the macOS Keychain (same place the `claude` CLI stores it). Run `claude` once interactively and log in with the Max account.
3. **Install and start the worker.** See [`docs/worker.md`](docs/worker.md) — TL;DR: `pnpm install && ./scripts/install-launchd.sh`.
4. **Set `CRON_SECRET`** in both `.env.local` and the Vercel project's env vars. Only `/api/sweep-runs` uses it now (LLM-triggering crons have moved to the local worker).
5. Dashboard trigger routes (all enqueue-only — they insert a `routine_runs` row and return; the worker picks it up):
   - `/api/run-generator` → "Run now" button on the header
   - `/api/trigger-research` → "Pursue" on a `new` idea
   - `/api/trigger-validate` → "Send to validation" on a `researched` idea
   - `/api/trigger-plan` → "Approve plan" on a `validated` idea
   - `/api/run-postmortem` → "Run post-mortem" on the header

> The dashboard polls `routine_runs` every 30s. Worker writes become visible within ~30s of completion.

## Deploy to Vercel

```bash
pnpm dlx vercel
# follow prompts; choose Next.js
# in the dashboard, add all env vars from .env.local
pnpm dlx vercel --prod
```

Or push to GitHub and import at vercel.com/new.

## Files

```
app/
  api/
    ideas/route.ts             GET /api/ideas?status=...
    update-idea/route.ts       POST patch + optional feedback insert
    trigger-research/route.ts  POST → routine 2
    trigger-plan/route.ts      POST → routine 3
    run-generator/route.ts     POST → routine 1
    patterns/route.ts          GET/POST/DELETE feedback_patterns
  components/                  tab-{inbox,researching,plans,archive,insights}
  page.tsx                     tab container
lib/
  supabase.ts                  service-role client + types
  fetcher.ts                   SWR helper + status styling
proxy.ts                       password gate (Next.js 16 proxy; skipped if DASHBOARD_PASSWORD unset)
```

The dashboard polls every 30s via SWR. Routine writes become visible within ~30s of completion.
