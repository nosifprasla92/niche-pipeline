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
| 1 | Generator | `GENERATOR_ROUTINE_ID` + `GENERATOR_TRIGGER_TOKEN` | Vercel Cron daily 04:00 UTC + UI "Run now" | 2026-05-19 (v2.1) | ⚠ v3 pending — emit `why_it_works`/`devils_advocate` as structured bullet arrays |
| 2 | Researcher | `DEEP_RESEARCH_ROUTINE_ID` + `DEEP_RESEARCH_TRIGGER_TOKEN` | UI "Pursue" on a `new` idea | 2026-05-19 (v2) | ✅ v2 — bracket-aware auto-kill thresholds |
| 3 | Validator | `VALIDATE_ROUTINE_ID` + `VALIDATE_TRIGGER_TOKEN` | UI "Send to validation" on a `researched` idea | 2026-05-19 (v2) | ✅ v2 — untested end-to-end |
| 4 | Planner | `PLAN_ROUTINE_ID` + `PLAN_TRIGGER_TOKEN` | UI "Approve plan" on a `validated` idea | 2026-05-19 (v2) | ✅ v2 — untested end-to-end |
| 5 | Post-mortem | `AI_GATEWAY_API_KEY` (in-repo, not a Cloud routine) | UI "Run post-mortem" + weekly cron Mon 05:00 UTC | 2026-05-19 (v3 in-repo) | ✅ v3 — runs in-process via AI SDK |

---

## 1. Generator

- **claude.ai URL:** https://claude.ai/code/routines/trig_01SFyDUpCQk8qrYYhJrKVjdD
- **Trigger:** Vercel Cron (`vercel.json` → `/api/run-generator`, daily 04:00 UTC) AND UI "Run now" button (top of dashboard)
- **App entry point:** [`app/api/run-generator/route.ts`](../app/api/run-generator/route.ts)
- **Prompt version:** v2.1 (5 ideas/run, 5-cell rotation across domain × GTM × positioning, realistic brackets $500–2K side / $3–8K real with month-12 MRR target, 8 hard exclusions, callback POST wired)
- **Pending update (v3):** Migration `0002_idea_insights_jsonb` (2026-05-19) changed `ideas.why_it_works` and `ideas.devils_advocate` from `text` to `jsonb`. The new shape is `InsightPoint[]` where each point is `{text: string, important?: boolean}`. The v2.1 prompt still emits prose strings; existing rows were backfilled as single-bullet arrays with `important: false`, so reads keep working, but new rows from v2.1 will continue to be single-bullet walls of text. Update the prompt so each field is 3–6 short bullets and AT MOST ONE bullet is marked `important: true` (the single most-decisive claim). Diff for paste-in:

  ```
  Replace the existing "Output format" section's why_it_works / devils_advocate
  fields with:

    "why_it_works": [
      {"text": "<one short claim>", "important": false},
      {"text": "<one short claim>", "important": false},
      {"text": "<the single strongest claim>", "important": true},
      {"text": "<one short claim>", "important": false}
    ],
    "devils_advocate": [
      {"text": "<one short objection>", "important": false},
      {"text": "<the single strongest objection>", "important": true},
      {"text": "<one short objection>", "important": false}
    ]

  Rules:
  - 3–6 bullets per field. Each bullet is one sentence, ideally under 30 words.
  - Mark AT MOST ONE bullet per field as important. Pick the one a busy reader
    must not miss. If no single bullet stands out, mark none.
  - Bullets are claims, not transitions. No "however", "additionally", "this
    means that". Each bullet stands alone.
  ```

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
- **Prompt version:** v2 (bracket-aware auto-kill thresholds: lifestyle <$15/mo or <$99 one-time → kill; business <$49/mo or <$499 one-time → kill; respects dislike patterns; callback POST wired)
- **Pending update:** none

**Reads:**
- `ideas[idea_context_id]` — full row including `why_it_works`, `devils_advocate`, `income_bracket`
- `feedback_patterns` for context

**Writes (success):**
- `ideas[idea_context_id]`: `competitors_above_50`, `competitor_complaints` (verbatim 1–3 star quotes), `competition_analysis`, `effort_weeks`, `effort_breakdown`, `zero_paid_path`, `researched_at`, `status = 'researched'`

**Writes (auto-kill — any of these trigger):**
- `lifestyle` bracket: no competitors charging >$15/mo or >$99 one-time (no proven willingness to pay)
- `business` bracket: no competitors charging >$49/mo or >$499 one-time
- No zero-paid path exists
- Effort > 12 weeks for solo MVP
- Flat or declining demand signals
- Matches any dislike pattern in `feedback_patterns`
- → `status = 'killed'`, `kill_reason` populated, `killed_at = now()`

**Callback:** `POST /api/routine-runs/{run_id}/complete` with summary like `"Researched #{id}: competitors_above_50=X, effort=Yw"` (or kill_reason on auto-kill)

**Known issues:** none.

---

## 3. Validator (new in 5-routine refactor)

- **claude.ai URL:** https://claude.ai/code/routines/trig_01QDwqYxk4asECd3SnPzHky7
- **Trigger:** UI "Send to validation" button on a `researched` Researching card → `POST /api/trigger-validate` → sets idea to `validating`, fires routine
- **App entry point:** [`app/api/trigger-validate/route.ts`](../app/api/trigger-validate/route.ts)
- **Prompt version:** v2 (3 plain-text artifacts: landing_copy with bracket-matched test price, interview_questions with mom-test 7, ad_test_plan with explicit success threshold; callback POST wired)
- **Pending update:** none — untested end-to-end as of 2026-05-19

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
- **Prompt version:** v2 (validation gate enforced: aborts with `status='error'` if `validated_at` is null; splits GTM into zero-paid + paid-after-10; financial projection capped at 2× bracket month-12 MRR ceiling; callback POST wired)
- **Pending update:** none

**Reads:**
- `ideas[idea_context_id]` — must have `validated_at IS NOT NULL`, else routine aborts with `status='error'`
- `feedback_patterns`

**Writes (success):**
- `ideas[idea_context_id]`: `business_plan` (JSONB with `executive_summary`, `target_customer`, `value_proposition`, `offer`, `go_to_market_zero_paid[]`, `go_to_market_paid_after_10_customers[]`, `launch_plan_12_weeks[]`, `tools_stack[]`, `financial_projection`, `biggest_risks[]`, `kill_conditions[]`), `first_actions[]` (3 specific TODOs for today), `plan_ready_at = now()`, `status = 'plan_ready'`

**Callback:** `POST /api/routine-runs/{run_id}/complete` with summary like `"Built 12-week plan for #{id}"` (or `status='error'` + abort message if `validated_at` was null)

**Known issues:** validation-gate abort path untested.

---

## 5. Post-mortem (in-repo, not a Cloud routine)

Unlike the other four routines, post-mortem runs **in-process inside the Next.js app**, not as a hosted Claude Cloud routine. It calls Claude directly via the Vercel AI Gateway, all inside one synchronous HTTP request. The previous Cloud-routine architecture (POSTMORTEM_ROUTINE_ID / POSTMORTEM_TRIGGER_TOKEN env vars) was removed 2026-05-19 because the hosted prompt was timing out without callback and the data flow is simpler in-repo.

- **Trigger:** UI "Run post-mortem" button on the dashboard header AND Vercel Cron (weekly Monday 05:00 UTC) → `POST /api/run-postmortem`
- **App entry point:** [`app/api/run-postmortem/route.ts`](../app/api/run-postmortem/route.ts)
- **Model:** `anthropic/claude-opus-4-7` via AI Gateway (`AI_GATEWAY_API_KEY` locally; OIDC on Vercel)
- **Runtime:** synchronous, ~10–30s. `maxDuration = 300`. Routine_runs row goes `triggered → accepted → completed` in one request.

**Reads:**
- `ideas` where `status='killed' AND killed_at > now() - interval '14 days'` — `id`, `title`, `kill_reason`
- `feedback_patterns` — all rows, both `like` and `dislike` (likes for profile context only, not modified)

**Writes (success):**
- Deletes any `feedback_patterns` rows the model marked as superseded (`replace_pattern_ids`)
- Inserts consolidated `pattern_type='dislike'` clusters in their place
- Upserts `pipeline_profile` singleton: 2–3 sentence second-person founder profile, regenerated each run

**Schema (Zod-enforced via `generateObject`):**
```
{
  replace_pattern_ids: number[],
  new_patterns: { pattern: string, confidence: number }[],
  profile_summary: string
}
```

**Tracked in `routine_runs`** like the Cloud routines so the runs drawer, conflict toast, failing banner, and cancel flow all keep working unchanged.

---

## Operational notes

- **One in-flight per routine.** The `routine_runs_in_flight_idx` UNIQUE partial index in Supabase means at most one row per routine can be `triggered` or `accepted` at a time. Concurrent trigger attempts get 409. The dashboard offers "Cancel and re-fire" toasts to break ties.
- **Sweeper.** A daily Vercel Cron (`vercel.json` → `/api/sweep-runs` at 04:30 UTC) promotes any `accepted` row older than 30 min to `timed_out` so a missing callback doesn't permanently wedge a routine.
- **Prompt updates take effect immediately** at claude.ai — no redeploy of this app needed. But after editing, **update the relevant section above** so the `Last edited` row matches reality.
- **To rotate `CRON_SECRET`:** edit in Vercel env vars + edit in all 5 routine prompts atomically. See [`routine-contract.md`](./routine-contract.md) for the per-purpose-secrets follow-up tracked in `TODOS.md`.
