# Niche Pipeline

Single-user dashboard for a daily small-business idea agent. Three Claude Cloud Routines write to Supabase; this Next.js app reads/writes the same tables and triggers the deep-research and plan-builder routines on demand.

## Local dev

```bash
cp .env.local.example .env.local
# fill in Supabase creds + the two API trigger URLs from your routines
pnpm install
pnpm dev
```

Open `http://localhost:3000?password=<DASHBOARD_PASSWORD>` (or remove `DASHBOARD_PASSWORD` to skip auth locally).

## Required setup before running

1. **Supabase project + schema** — run the SQL from the build kit (`ideas` + `feedback_patterns` tables, plus the `touch_updated_at` trigger).
2. **Three Claude Cloud Routines** at <https://claude.ai/code/routines>. All three are API-trigger type (no cron) — scheduling is handled by Vercel Cron, not by Anthropic, so the dashboard can also fire them on demand:
   - **Idea Generator** — fired daily at 04:00 UTC (= 8 AM Mahe) by Vercel Cron, and on demand by the "Run now" button.
   - **Deep Researcher** — fired on demand when you click "Pursue" on an idea.
   - **Plan Builder** — fired on demand when you click "Build plan" on a researched idea.
3. **Mint an API trigger on each routine.** Open the routine page → "Add API trigger" → copy the `sk-ant-oat01-…` token (shown once) and the routine ID (`trig_…` from the URL) into `.env.local` as `{NAME}_ROUTINE_ID` + `{NAME}_TRIGGER_TOKEN`. The dashboard fires routines via `POST https://api.anthropic.com/v1/claude_code/routines/{id}/fire` with that token — see [`lib/fire-routine.ts`](lib/fire-routine.ts).
4. **Set `CRON_SECRET`** in both `.env.local` (for local awareness) and the Vercel project's env vars. Vercel Cron sends this as `Authorization: Bearer ${CRON_SECRET}` when hitting `/api/run-generator`; the password gate in [`proxy.ts`](proxy.ts) recognizes the header and lets the request through.
5. The three triggers in the app:
   - `/api/run-generator` → fires the generator routine. GET (from Vercel Cron, requires `CRON_SECRET`) and POST (from the "Run now" button, gated by the dashboard password) both work.
   - `/api/trigger-research` → sets the idea's status to `pursuing`, then fires the researcher. The researcher picks up the most recently updated `pursuing` row.
   - `/api/trigger-plan` → sets the idea's status to `planning`, then fires the planner. Same status-based contract.

> The Anthropic `fire` endpoint does not accept a payload, so the routines locate their target row by `status` rather than by a passed `idea_id`. Keep one idea in flight per stage at a time.

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
