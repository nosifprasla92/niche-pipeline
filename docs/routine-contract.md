# Routine ↔ Dashboard Contract

This document describes the HTTP contract that Claude Cloud Routines use to
talk back to the niche-pipeline dashboard. Each of the three routines
(Generator, Researcher, Planner) must implement this contract for the
observability and feedback-wiring features added in A+.

The dashboard side is shipped as part of A+. The routine side lives at
[claude.ai/code/routines](https://claude.ai/code/routines) — outside this
repo — and must be updated by hand following the deploy runbook at the end
of this doc.

---

## Authentication

All three endpoints are gated by `proxy.ts`. Routines authenticate by sending:

```
Authorization: Bearer ${CRON_SECRET}
```

The dashboard's `proxy.ts` recognizes a matching bearer and bypasses the
password gate.

**Secret hygiene:** `CRON_SECRET` is shared by Vercel Cron AND all three
routine back-channels. If a routine prompt leaks (debug paste, screenshot),
rotate `CRON_SECRET` in Vercel env vars + update Vercel Cron + update all
three routine prompts atomically. The P3 follow-up to split this into
per-purpose secrets is tracked in `TODOS.md`.

Header-propagation note: if Claude Cloud Routines turn out to strip or
rewrite the `Authorization` header, fall back to a query-param secret
(`?token=${CRON_SECRET}`) and update `proxy.ts` to accept either form. The
T0 spike informally confirmed routines can make outbound HTTPS (via
Supabase), but did not exhaustively verify header propagation; T6
implementation will smoke-test this.

---

## Endpoints

### 1. `GET /api/routine-runs/latest?routine={name}`

Used by all three routines at startup to discover their own `run_id`.

Anthropic's `/fire` endpoint accepts no payload, so the dashboard cannot
pass a run_id to the routine directly. Instead the dashboard pre-INSERTs
a `routine_runs` row at trigger time with status `accepted`; the routine
fetches the most recent `accepted` row for its routine name. This is safe
by invariant: the `routine_runs_in_flight_idx` UNIQUE partial index
guarantees at most one in-flight row per `routine_name`, so "latest"
unambiguously refers to the row the trigger just inserted.

**Request:**

```
GET /api/routine-runs/latest?routine=generator
Authorization: Bearer ${CRON_SECRET}
```

`routine` must be one of `generator`, `researcher`, `planner`.

**Response (200):**

```json
{
  "run_id": 1234,
  "routine_name": "generator",
  "triggered_by": "cron",
  "started_at": "2026-05-18T04:00:01.123Z",
  "idea_context_id": null
}
```

For `researcher` and `planner`, `idea_context_id` will be the ID of the
idea the trigger endpoint just set to `pursuing` or `planning`.

**Response (404):** no in-flight run for that routine. Means the routine
was invoked but no trigger endpoint inserted a row — probably a stale
manual fire from before A+ shipped. The routine should abort.

### 2. `POST /api/routine-runs/{id}/complete`

Used by all three routines at the end of execution to mark the run
finished. Endpoint is idempotent: a second POST for the same `id` returns
200 with no state change (status-check before update).

**Request:**

```
POST /api/routine-runs/1234/complete
Authorization: Bearer ${CRON_SECRET}
Content-Type: application/json

{
  "status": "completed",
  "summary": "Generated 3 ideas, 0 rejected after dedupe.",
  "idea_ids": [42, 43, 44]
}
```

`status` is one of:
- `completed` — routine finished successfully (with or without writes)
- `error` — routine hit an unrecoverable error; include the error in `summary`

`summary` is free-text, typically 1-3 sentences for the runs panel.

`idea_ids` is optional. Generator and Researcher should include the IDs of
ideas they created or modified; Planner can omit.

**Response (200, fresh):**

```json
{ "ok": true, "transitioned": true, "from": "accepted", "to": "completed" }
```

**Response (200, idempotent no-op):**

```json
{ "ok": true, "transitioned": false, "current_status": "completed" }
```

**Response (401):** bad or missing Bearer.
**Response (404):** unknown `run_id`.
**Response (400):** malformed body (missing or invalid `status`).

### 3. `GET /api/patterns?limit=20` (Generator only)

Used by the Generator routine to fetch recent user feedback patterns for
prompt context. The endpoint exists from before A+; A+ adds the `limit`
query param.

**Request:**

```
GET /api/patterns?limit=20
Authorization: Bearer ${CRON_SECRET}
```

**Response (200):**

```json
{
  "patterns": [
    {
      "id": 9,
      "created_at": "2026-05-17T09:14:00Z",
      "pattern_type": "dislike",
      "pattern": "Anything requiring physical inventory",
      "confidence": 0.8,
      "source_idea_id": 41
    },
    { "id": 8, "pattern_type": "like", "pattern": "B2B SaaS with clear ICP", ... }
  ]
}
```

Generator's prompt should grade each generated idea against the
`like`/`dislike` patterns and either avoid `dislike` matches or refine
toward `like` matches.

---

## Routine Prompt Skeletons

These are skeletons. Adapt the existing prompts at claude.ai/code/routines
by adding the marked sections.

### Generator

```
[existing system prompt and instructions ...]

## SETUP — fetch run_id and feedback

1. GET ${DASHBOARD_URL}/api/routine-runs/latest?routine=generator
   Header: Authorization: Bearer ${CRON_SECRET}
   Capture: run_id

2. GET ${DASHBOARD_URL}/api/patterns?limit=20
   Header: Authorization: Bearer ${CRON_SECRET}
   Capture: patterns (array of {pattern_type, pattern, confidence})

   Use these to filter or refine generation: avoid ideas matching
   high-confidence dislikes, favor ideas matching high-confidence likes.

[ ... existing generation logic, writes to ideas table ... ]

## CALLBACK — mark run complete

POST ${DASHBOARD_URL}/api/routine-runs/{run_id}/complete
Header: Authorization: Bearer ${CRON_SECRET}
Body: {
  "status": "completed",
  "summary": "Generated N ideas. Filtered M against dislike patterns.",
  "idea_ids": [...]
}

If anything in the generation step errored, POST with status="error"
and put the error message in summary.
```

### Researcher

```
[existing prompt ...]

## SETUP

1. GET ${DASHBOARD_URL}/api/routine-runs/latest?routine=researcher
   Capture: run_id, idea_context_id

   idea_context_id tells you which specific idea to research (the trigger
   endpoint set its status to 'pursuing'). Use this as the target row,
   not "most recently updated pursuing" — the latest endpoint already
   resolved that.

[ ... existing research logic, writes back to ideas[idea_context_id] ... ]

## CALLBACK

POST ${DASHBOARD_URL}/api/routine-runs/{run_id}/complete
Body: {
  "status": "completed",
  "summary": "Researched idea #{idea_context_id}: competition_score=X/10, effort=Yw."
}
```

### Planner

```
[existing prompt ...]

## SETUP

1. GET ${DASHBOARD_URL}/api/routine-runs/latest?routine=planner
   Capture: run_id, idea_context_id

[ ... existing plan-building logic ... ]

## CALLBACK

POST ${DASHBOARD_URL}/api/routine-runs/{run_id}/complete
Body: {
  "status": "completed",
  "summary": "Built 12-week plan for idea #{idea_context_id}."
}
```

---

## Deploy Runbook

The contract above only works if the dashboard code (with the new endpoints)
is deployed BEFORE the routine prompts are updated. Otherwise routines
will POST to endpoints that 404. Conversely, if you update prompts first
and the deploy is delayed, every routine fire after the prompt update will
fail at the SETUP step.

**Order of operations for every A+ deploy and every subsequent routine
prompt edit:**

1. **Code first.** Merge the A+ feature branch to `main`. Wait for the
   Vercel production deploy to show "Ready". Verify by hitting:
   ```
   curl https://your-dashboard.vercel.app/api/routine-runs/latest?routine=generator \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
   Expect 404 (no in-flight run yet) — that confirms the endpoint exists
   and auth works. A 401 means CRON_SECRET doesn't match; a NOT_FOUND
   plain-text response means the route didn't deploy.

2. **Update Generator prompt.** Add the SETUP + CALLBACK sections from
   the skeleton above. Save.

3. **Test Generator end-to-end.** Manually fire the Generator (via the
   dashboard "Run now" button OR via Anthropic /fire). Watch the runs
   panel: the row should go `triggered → accepted → completed` within
   a few minutes. If it sticks at `accepted`, check Anthropic's routine
   run log for the callback POST attempt.

4. **Update Researcher prompt.** Same pattern. Test by clicking Pursue
   on a real idea; row should transition through to `completed`.

5. **Update Planner prompt.** Same. Test by clicking Build Plan on a
   researched idea.

6. **Verify the runs panel.** All three routines should show clean runs
   in the header drawer with green dots.

**Rollback:**

If a prompt update breaks something, the fix is to revert the prompt edit
at claude.ai. The dashboard endpoints stay in place and are
backward-compatible (they handle missing callbacks gracefully — see the
T15 sweeper, which will mark stuck rows `timed_out` after 30 min).

If a dashboard deploy breaks something, `git revert` the offending
commit and redeploy. The old routine prompts (without SETUP/CALLBACK)
will continue to function — they'll just write to ideas/feedback_patterns
without the run-tracking layer, exactly like pre-A+ behavior.

---

## Future: Per-purpose Secrets (TODOS.md P3)

When this becomes a real concern (multi-tenant, paired with a teammate,
prompts shared externally), split `CRON_SECRET` into:
- `CRON_SECRET` — Vercel Cron → run-generator only
- `ROUTINE_CALLBACK_SECRET` — routine → callback / latest / patterns

Update `proxy.ts` to accept either, scoped to the matching route. Update
each routine prompt to use the new secret. Rotate independently.
