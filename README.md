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
2. **Three Claude Cloud Routines** — Idea Generator (daily 8am), Deep Researcher (API trigger), Plan Builder (API trigger). Copy the two API trigger URLs into `.env.local`.
3. **(Optional)** Add an API trigger to the Idea Generator routine too, paste its URL into `GENERATOR_TRIGGER_URL`, and the "Run now" button will fire it.

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
