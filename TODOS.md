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

## P2 — Move `checked_task_keys` out of `business_plan` JSON to a top-level column

**What:** Add `ideas.checked_task_keys text[] NULL DEFAULT '{}'` column via
migration. Update `tab-in-progress.tsx` to PATCH `{checked_task_keys: [...]}`
directly (not the wrapped business_plan blob). Drop the nested-key persistence.

**Why:** Codex review (2026-05-21) flagged that `worker/handlers/planner.ts`
overwrites `business_plan` wholesale when a plan is regenerated, silently
wiping any `checked_task_keys` nested inside. The current optimistic-lock
also opens a brief window where a stale-tab tick can write the old plan body
back, reverting planner output. Today the planner-regen path isn't reachable
from the UI (no UI exists to re-trigger planner on an in_progress idea), but
a direct `POST /api/trigger-plan` with an in_progress idea_id bypasses the
ALLOWED_TRANSITIONS guard and triggers the wipe.

**Pros:** Eliminates the wipe risk by keeping check progress structurally
separate from LLM-regenerated plan content. Smaller PATCH payload. Easier
to query "what tasks did the user complete?" across ideas later.
**Cons:** One migration. Touch points: `lib/supabase.ts` Idea type,
`tab-in-progress.tsx` read/write, the API route (now patches a real column).

**Context:** Codex adversarial review finding #1 on PR #2 (feat/plan-c-execution-stage).
Deferred because the path isn't reachable from the current UI; ship Plan C now
and follow up before any feature ships that lets users re-trigger planner on
existing in_progress ideas.

**Effort:** S (human ~1hr / CC ~15min)
**Priority:** P2
**Depends on:** PR #2 (Plan C foundation) merged.

---

## P3 — Tighten update-idea route tests

**What:** Replace the chainable-builder mock in
`app/api/update-idea/route.test.ts` with per-method stubs that distinguish
`.maybeSingle()` (single object or null) from `await query.select()` (array).
Or migrate to a real @supabase/supabase-js test double.

**Why:** Codex review flagged the current mock returns the same data for every
terminal call. The "rejects killed → in_progress" test passes because the
guard returns 400 before update ever runs, but if a future change adds a
read-after-write or feedback insert, the test silently shifts behavior with
no failure.

**Pros:** Tests stop passing-by-accident; refactors surface real regressions.
**Cons:** More mock surface to maintain.

**Context:** Codex adversarial review finding #8 on PR #2.

**Effort:** S (human ~45min / CC ~10min)
**Priority:** P3
**Depends on:** PR #2 merged.

---

## P2 — Worker heartbeat + Mac-asleep alert

**What:** Worker emits a heartbeat every 5 min (write `pipeline_profile.last_heartbeat`
or a dedicated `worker_heartbeats` table). A small Vercel cron checks "last heartbeat
older than 15 min" and alerts via Slack (reuses Plan B's SLACK_BOT_TOKEN once that
ships). Optionally also fire the daily generator schedule from Vercel cron as a safety
net — deduped by the existing UNIQUE in-flight index.

**Why:** Today if the Mac sleeps at 04:00 UTC, the day's idea drop is silently skipped
(`docs/worker.md` says so explicitly). Same applies to weekly post-mortem. Plan B's
digest inherits the same failure mode — silent gap until you travel and lose a week
of mornings. The unique partial index makes the Vercel-cron fallback safe.

**Pros:** Closes the worker single-point-of-failure; mandatory before you can leave
the Mac unattended for >24h. Reuses Plan B's Slack channel if it ships first.
**Cons:** Small ongoing cost (one extra Vercel cron + a heartbeat write every 5 min).
Requires either Plan B to ship first (for Slack alert) or a parallel notification
channel.

**Context:** Came out of `/plan-ceo-review` on 2026-05-21 as Approach D, declined for
the A+B+C bundle scope. Documented per D10 so the failure mode doesn't get forgotten.

**Effort:** S (human ~1-2 days / CC ~1 hour)
**Priority:** P2
**Depends on:** Plan B shipping first (for Slack alert channel); otherwise standalone.

---

## P3 — Outcome tracking per launched idea

**What:** Once Plan C ships and ideas can reach `launched` status, add columns to
`ideas` (or a new `idea_outcomes` table) tracking real outcomes: `mrr_usd`,
`customer_count`, `died_at`, `died_reason`, `outcome_notes`. Periodic prompt
("update outcome for launched idea #42?") or a tab section listing launched ideas
with editable outcome fields.

**Why:** Post-mortem currently learns from kill_reason (negative signal only).
With outcome data, post-mortem can also learn from positive signal: "ideas matching
this pattern actually shipped + earned." Closes the highest-quality feedback loop —
outcome → pattern → next idea's quality.

**Pros:** Highest-leverage signal source the system can have. Turns the
post-mortem from "what didn't work" into "what worked AND what didn't."
**Cons:** Schema decision (columns vs table) needs thought; outcome data is
self-reported and may degrade if you stop logging it.

**Context:** Came out of `/plan-ceo-review` on 2026-05-21 as D9. Deferred because
it depends on Plan C shipping AND on having at least one launched idea, neither of
which exist yet.

**Effort:** M (human ~2-3 days / CC ~2 hours)
**Priority:** P3
**Depends on:** Plan C shipped; at least one idea has actually reached `launched`.

---

## Backlog — Future Direction

These are recorded so they're not lost; not active TODOs.

- **Embedding-based inbox ranking** — D6 option C from 2026-05-21 review.
  Considered and rejected for A+B+C bundle (reintroduces API cost). Revisit if
  tag-overlap ranking proves too coarse after a month of data.
- **Email fallback for Slack delivery failure** — D5 option C from 2026-05-21 review.
  Rejected for the bundle (two-integration trap). Revisit if Slack delivery proves
  unreliable.
- **Integration tests for optimistic locking + Slack** — D7 option A from 2026-05-21
  review. Deferred; only pure-function ranking tests in scope for A+B+C. Next CEO
  plan should consider this.
