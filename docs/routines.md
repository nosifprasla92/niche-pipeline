# Routine Inventory

Single source of truth for the 5 Claude Cloud Routines that drive this
pipeline. Each routine lives at [claude.ai/code/routines](https://claude.ai/code/routines)
(outside this repo), is identified by a `trig_…` ID, and is fired via an
API trigger token. This file tracks *what they are and what they should
do*. The HTTP contract they implement lives in
[`routine-contract.md`](./routine-contract.md).

**Update this file whenever you edit a routine prompt at claude.ai.**
The `Prompt version` and `Last edited` rows are how future-you (and a
fresh CC session) know whether the routine matches what this doc
describes.

## At a glance

| # | Routine | Env vars | Fired by | Last edited | Status |
|---|---|---|---|---|---|
| 1 | Generator | `GENERATOR_ROUTINE_ID` + `GENERATOR_TRIGGER_TOKEN` | Vercel Cron daily 04:00 UTC + UI "Run now" | 2026-05-19 | ✅ working (prompt pending v2 rotation update) |
| 2 | Researcher | `DEEP_RESEARCH_ROUTINE_ID` + `DEEP_RESEARCH_TRIGGER_TOKEN` | UI "Pursue" on a `new` idea | 2026-05-19 | ✅ working |
| 3 | Validator | `VALIDATE_ROUTINE_ID` + `VALIDATE_TRIGGER_TOKEN` | UI "Send to validation" on a `researched` idea | 2026-05-19 | ✅ working (untested end-to-end) |
| 4 | Planner | `PLAN_ROUTINE_ID` + `PLAN_TRIGGER_TOKEN` | UI "Approve plan" on a `validated` idea | 2026-05-19 | ✅ working (untested end-to-end) |
| 5 | Post-mortem | `POSTMORTEM_ROUTINE_ID` + `POSTMORTEM_TRIGGER_TOKEN` | UI "Run post-mortem" on Insights tab | 2026-05-19 | ✅ working (untested end-to-end) |

---

## 1. Generator

- **claude.ai URL:** https://claude.ai/code/routines/trig_01SFyDUpCQk8qrYYhJrKVjdD
- **Trigger:** Vercel Cron (`vercel.json` → `/api/run-generator`, daily 04:00 UTC) AND UI "Run now" button (top of dashboard)
- **App entry point:** [`app/api/run-generator/route.ts`](../app/api/run-generator/route.ts)
- **Prompt version:** v1 (3 ideas/run with bracket alternation only)
- **Pending update:** v2.1 — 5 ideas/run, rotates across domain × GTM × positioning per run, realistic brackets ($500–2K side / $3–8K real, month-12 MRR target), 8 hard exclusions, callback POST wired

**Reads:**
- `ideas` — recent titles (last 60 days) for dedup; `killed` titles + `kill_reason` for negative learning; most recent `income_bracket` to alternate
- `feedback_patterns` — likes (lean toward) + dislikes (avoid)

**Writes:**
- 5 new rows to `ideas` with `status = 'new'`, `income_bracket` set, tags include cell tuple `[domain, gtm_style, positioning]`

**Callback:** `POST /api/routine-runs/{run_id}/complete` with `{status:'completed', summary, idea_ids:[…]}`

**Known issues:**
- v1 prompt's bracket alternation defaulted to `business` when `income_bracket` was null on the most recent row. Fixed in v2.1 (defaults to `lifestyle` on null).
- v1 produced same archetype 3× per run. v2.1 forces 5 different cells.

---

## 2. Researcher

- **claude.ai URL:** https://claude.ai/code/routines/trig_01CSaYWLaLJ3ZJ1359FDj4Ry
- **Trigger:** UI "Pursue" button on an Inbox card → `POST /api/trigger-research` → sets idea to `pursuing`, fires routine
- **App entry point:** [`app/api/trigger-research/route.ts`](../app/api/trigger-research/route.ts)
- **Prompt version:** v1
- **Pending update:** none

**Reads:**
- `ideas[idea_context_id]` — full row including `why_it_works`, `devils_advocate`, `income_bracket`
- `feedback_patterns` for context

**Writes (success):**
- `ideas[idea_context_id]`: `competitors_above_50`, `competitor_complaints` (verbatim 1–3 star quotes), `competition_analysis`, `effort_weeks`, `effort_breakdown`, `zero_paid_path`, `researched_at`, `status = 'researched'`

**Writes (auto-kill — any of these trigger):**
- No competitors charging >$25 (no proven willingness to pay)
- No zero-paid path exists
- Effort > 12 weeks for solo MVP
- Flat or declining demand signals
- → `status = 'killed'`, `kill_reason` populated, `killed_at = now()`

**Callback:** `POST /api/routine-runs/{run_id}/complete` with summary like `"Researched #{id}: competitors_above_50=X, effort=Yw"` (or kill_reason on auto-kill)

**Known issues:** none.

---

## 3. Validator (new in 5-routine refactor)

- **claude.ai URL:** https://claude.ai/code/routines/trig_01QDwqYxk4asECd3SnPzHky7
- **Trigger:** UI "Send to validation" button on a `researched` Researching card → `POST /api/trigger-validate` → sets idea to `validating`, fires routine
- **App entry point:** [`app/api/trigger-validate/route.ts`](../app/api/trigger-validate/route.ts)
- **Prompt version:** v1
- **Pending update:** none — but untested end-to-end as of 2026-05-19

**Reads:**
- `ideas[idea_context_id]` — full row including research output

**Writes (success):**
- `ideas[idea_context_id]`: `landing_copy` (headline, subhead, bullets, demo concept, paid CTA, test price), `interview_questions` (5 prospects + 7 mom-test questions + single signal), `ad_test_plan` ($50 channel + targeting + 2 headlines + threshold), `validation_signals` (3 numbers to collect + kill thresholds), `validated_at = now()`, `status = 'validated'`

**Callback:** `POST /api/routine-runs/{run_id}/complete` with summary like `"Validation kit ready for #{id}. Test price: $X."`

**Real-world gate after this routine:** YOU run the landing page, do 5 interviews, run the $50 ad. Hit thresholds → flip to `planning`. Miss them → flip to `killed` with `kill_reason`.

**Known issues:** untested with a real idea.

---

## 4. Planner

- **claude.ai URL:** https://claude.ai/code/routines/trig_01SEb3SFVpCgmagqBLxaaCGj
- **Trigger:** UI "Approve plan" button on a `validated` Validating card → `POST /api/trigger-plan` → sets idea to `planning`, fires routine
- **App entry point:** [`app/api/trigger-plan/route.ts`](../app/api/trigger-plan/route.ts)
- **Prompt version:** v1 (updated for validation gate)
- **Pending update:** none

**Reads:**
- `ideas[idea_context_id]` — must have `validated_at IS NOT NULL`, else routine aborts with `status='error'`
- `feedback_patterns`

**Writes (success):**
- `ideas[idea_context_id]`: `business_plan` (JSONB with `executive_summary`, `target_customer`, `value_proposition`, `offer`, `go_to_market_zero_paid[]`, `go_to_market_paid_after_10_customers[]`, `launch_plan_12_weeks[]`, `tools_stack[]`, `financial_projection`, `biggest_risks[]`, `kill_conditions[]`), `first_actions[]` (3 specific TODOs for today), `plan_ready_at = now()`, `status = 'plan_ready'`

**Callback:** `POST /api/routine-runs/{run_id}/complete` with summary like `"Built 12-week plan for #{id}"` (or `status='error'` + abort message if `validated_at` was null)

**Known issues:** validation-gate abort path untested.

---

## 5. Post-mortem (new in 5-routine refactor)

- **claude.ai URL:** https://claude.ai/code/routines/trig_01Xj3TEq1YPMrSyMgUhUK3QE
- **Trigger:** UI "Run post-mortem" button on Insights tab → `POST /api/run-postmortem`. Manual-only (no cron).
- **App entry point:** [`app/api/run-postmortem/route.ts`](../app/api/run-postmortem/route.ts)
- **Prompt version:** v1
- **Pending update:** none

**Reads:**
- `ideas` where `status = 'killed' AND killed_at > now() - interval '14 days'` — fetch `id`, `title`, `kill_reason`, `killed_at`
- `feedback_patterns` (existing dislikes for dedup)

**Writes:**
- 1–3 rows upserted into `feedback_patterns` with `pattern_type='dislike'`, `pattern` = cluster description, `confidence` proportional to cluster size

**Callback:** `POST /api/routine-runs/{run_id}/complete` with summary like `"Clustered N killed ideas into M dislike patterns"`

**Known issues:** untested with real killed-idea clusters.

---

## Operational notes

- **One in-flight per routine.** The `routine_runs_in_flight_idx` UNIQUE partial index in Supabase means at most one row per routine can be `triggered` or `accepted` at a time. Concurrent trigger attempts get 409. The dashboard offers "Cancel and re-fire" toasts to break ties.
- **Sweeper.** A daily Vercel Cron (`vercel.json` → `/api/sweep-runs` at 04:30 UTC) promotes any `accepted` row older than 30 min to `timed_out` so a missing callback doesn't permanently wedge a routine.
- **Prompt updates take effect immediately** at claude.ai — no redeploy of this app needed. But after editing, **update the relevant section above** so the `Last edited` row matches reality.
- **To rotate `CRON_SECRET`:** edit in Vercel env vars + edit in all 5 routine prompts atomically. See [`routine-contract.md`](./routine-contract.md) for the per-purpose-secrets follow-up tracked in `TODOS.md`.
