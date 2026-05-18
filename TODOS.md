# TODOS

Deferred work tracked from CEO plan reviews. Each entry includes context so
future-you (or a fresh CC session) can pick it up cold.

---

## ~~P2 — Run sweeper~~ — PROMOTED TO A+ SCOPE (eng review D8)

Originally deferred from CEO review. The `/plan-eng-review` outside voice
flagged that the UNIQUE partial index on routine_runs makes a stuck
'accepted' row block ALL future triggers for that routine — sweeper is
the unblock mechanism, not optional cleanup. Now T15 in A+ implementation
tasks.

---

## P2 — Failure alerts (Slack or email on `routine_runs.status='error'`)

**What:** Webhook-based notifier triggered on routine_runs INSERT/UPDATE with
`status='error'`. Implementation options: Supabase database webhook → Vercel
endpoint → Resend/Slack; or app-side polling.

**Why:** Today (post-A+) silent failures show as a red dot on the dashboard.
You only see it if you open the URL. If a routine errors at 4am and you don't
check the dashboard until evening, that's most of a day lost.

**Pros:** Closes the silent-failure window outside the dashboard.
**Cons:** Adds an outbound integration (deliverability, secret management,
choice of channel). Slack requires having a workspace; email requires a
deliverability provider (Resend recommended).

**Context:** Came out of `/plan-ceo-review` on 2026-05-18 as D4 (cherry-pick
deferred) and reaffirmed as D11. Reason for deferral: channel choice
(Slack vs email vs web push) is taste, and you don't want to decide it under
the A+ deadline.

**Effort:** M (human ~2hr / CC ~20min)
**Priority:** P2
**Depends on:** A+ plan landed; sweeper (above) recommended first so alerts
fire on real errors, not stuck-but-still-running rows.

---

## P3 — Split CRON_SECRET into per-purpose secrets

**What:** Introduce a second secret (e.g. `ROUTINE_CALLBACK_SECRET`) for the
routine → dashboard back-channels (`/api/routine-runs/[id]/complete`,
`/api/routine-runs/latest`, `/api/patterns?limit=20`). Keep `CRON_SECRET`
scoped to Vercel Cron → `/api/run-generator` only. Update `proxy.ts` to
accept either secret on the right routes.

**Why:** Post-A+, one secret authorizes four distinct flows (Vercel Cron +
3 routine back-channels). If the routine prompt leaks the secret (debug
paste, screenshot), the Vercel Cron path is also compromised. Splitting
halves the blast radius and lets you rotate routine secrets without
touching Vercel's cron configuration.

**Pros:** Smaller blast radius per leak; independent rotation per concern.
**Cons:** Two env vars instead of one; two code paths in `proxy.ts`;
slightly more complex routine-prompt update procedure.

**Context:** Came out of `/plan-eng-review` on 2026-05-18 as D3. Deferred
because the single-user blast radius is small (one user, your own routine
prompts) and the threat model is mostly accident rather than adversary.
Worth doing if you ever multi-tenant this, pair with a teammate, or
publish/share routine prompts.

**Effort:** S (human ~45min / CC ~10min)
**Priority:** P3
**Depends on:** A+ plan landed.

---

## P3 — Postgres CHECK constraint on `ideas.status`

**What:** `ALTER TABLE ideas ADD CONSTRAINT status_check CHECK (status IN ('new',
'pursuing', 'researched', 'planning', 'plan_ready', 'in_progress', 'launched',
'passed'))`. Coordinate updates with `lib/supabase.ts` Status union going forward.

**Why:** Today the Status enum lives only in TypeScript. A typo in any
mutation path (`status='reseached'`) silently breaks tab filters. A DB-level
check makes bad values impossible.

**Pros:** Permanent data-integrity guarantee.
**Cons:** Couples DB and TS — every status addition needs both a migration
and a code change in lockstep. Mild iteration friction.

**Context:** Came out of `/plan-ceo-review` on 2026-05-18 as D5 (cherry-pick
deferred) and reaffirmed as D12. Reason for deferral: pipeline shape is still
fluid (might add execution-stage statuses if Plan C ships later). Lock the
enum once the shape settles.

**Effort:** S (human ~30min / CC ~5min)
**Priority:** P3
**Depends on:** Pipeline shape decision (whether to ship Plan C — execution
stage tab — eventually).

---

## Backlog — Future Direction

These are recorded so they're not lost; not active TODOs.

- **Plan B — Daily digest delivery** (email or push when generator runs).
  Closes the "I forget to check the URL" failure mode. Revisit after A+ ships
  and you have ~1 month of run-history data to confirm whether you're actually
  opening the dashboard daily.
- **Plan C — Execution stage** (in_progress tab; plans-as-checklist from
  `business_plan.launch_plan_12_weeks`). Plugs the biggest pipeline leak —
  plans that never get executed. Larger scope; requires deciding whether
  "funnel to action" is the actual product framing.
- **Cost/token tracking per routine_run.** Add `input_tokens`, `output_tokens`,
  `cost_usd` columns to routine_runs. Routine callback would need to include
  these. Useful for "is this hobby getting expensive?" signal.
- **Inbox ranking by feedback signal.** Use feedback_patterns to score new
  ideas and sort the inbox. Only meaningful once feedback patterns are
  proven to be consumed (A+ does the wiring; this is the next step).
