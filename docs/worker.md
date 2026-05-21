# Local worker

A long-running Node process on your Mac that drives the pipeline using your
Claude Code **Max plan** instead of Anthropic API credits. Replaces the four
Cloud Routines (Generator / Researcher / Validator / Planner) and the
in-process AI Gateway post-mortem.

## How it works

```
 ┌───────────────────┐                       ┌──────────────────────┐
 │  Dashboard / UI   │ ─POST /api/trigger-*─▶│  routine_runs row    │
 │  (Vercel)         │                       │  status='triggered'  │
 └───────────────────┘                       └──────────┬───────────┘
                                                        │ poll every 5s
                                                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  Local worker (this machine)                                    │
 │  • claims a 'triggered' row (atomic UPDATE)                     │
 │  • marks 'accepted'                                             │
 │  • dispatches to handler                                        │
 │    └─ handler calls Claude Agent SDK → Max session              │
 │  • writes idea columns + marks 'completed' (or 'error')         │
 └─────────────────────────────────────────────────────────────────┘
```

The worker:
- **Polls** `routine_runs` every 5s for `status='triggered'` rows.
- **Claims** one atomically (`UPDATE … WHERE status='triggered'` → `'accepted'`).
- **Dispatches** to one of five handlers based on `routine_name`.
- **Schedules** the daily generator (04:00 UTC) and weekly post-mortem
  (Monday 05:00 UTC) by inserting rows directly into the same queue.
- **Sweeps** stale `accepted` rows older than 30 min (same logic as the old
  Vercel cron, now in-process).

## Setup

### 1. Log into Claude Code on Max

The worker uses the same OAuth session your `claude` CLI uses. Verify by
running `claude` once interactively — if it prompts for login, log in with
the account that has the Max subscription. The token lives in macOS Keychain
under "Claude Code-credentials".

**Do not set `ANTHROPIC_API_KEY`.** The worker hard-fails on startup if it
finds one in the environment — an API key would silently override the OAuth
session and bill against the API instead of Max, defeating the entire point.

### 2. Install deps

```bash
pnpm install
```

This adds `@anthropic-ai/claude-agent-sdk`, `tsx`, and `dotenv`.

### 3. Run it manually first

```bash
pnpm worker
```

You should see:

```
[worker] started (poll=5000ms, once=false)
```

Trigger a generator run from a separate terminal:

```bash
curl -X POST http://localhost:3100/api/run-generator \
    -H "Content-Type: application/json" -d '{}'
```

Within ~5 seconds the worker should log:

```
[worker] start generator run #123
[worker] done generator run #123 in 18.4s — Generated 5 ideas (...)
```

### 4. Install as a launchd agent (auto-start)

```bash
./scripts/install-launchd.sh
```

This:
- Writes `~/Library/LaunchAgents/com.niche-pipeline.worker.plist`
- Bootstraps it into your `gui/$UID` domain
- Starts it immediately (`launchctl kickstart -k`)
- Configures it to auto-restart on crash and run at login

Logs land in `~/Library/Logs/niche-pipeline-worker.{out,err}.log`.

## Operations

### Watch live

```bash
tail -f ~/Library/Logs/niche-pipeline-worker.out.log
```

### Stop / start

```bash
launchctl bootout gui/$(id -u)/com.niche-pipeline.worker
launchctl kickstart -k gui/$(id -u)/com.niche-pipeline.worker
```

### Reinstall after code changes

```bash
./scripts/install-launchd.sh
```

The script is idempotent — it stops the existing agent and reloads.

### Run a one-shot

```bash
pnpm worker:once
```

Processes one queued job (if any), then exits. Useful for testing handlers
or processing a stuck job after a worker crash.

## Spend brakes (still active)

The 3-brake spend guard from `lib/spend-guard.ts` remains in place even
though the worker doesn't bill API credits. It still works on `routine_runs`
count, so if you ever flip `HALT_ALL_AI=1` or trip the daily cap, the
*dashboard* trigger routes refuse to enqueue. Belt-and-suspenders.

## Tuning the timeout (review periodically)

Each Agent SDK call has a **15-minute hard timeout** (`worker/claude.ts:DEFAULT_TIMEOUT_MS`). It exists only to catch hung calls — not to enforce fast runs. Quality is the priority; speed isn't.

Rationale: tools are disabled in the worker, so the SDK can't enter an agent loop. A legitimate slow Opus run on the heaviest schemas peaks around 8-10 min. 15 min leaves headroom for outlier-slow runs; anything past that is almost certainly hung (network drop, model stuck).

### When to bump it

If you see `claude.timeout` errors in `routine_runs.error_message` on real (not hung) runs, the timeout is too tight. Bump `DEFAULT_TIMEOUT_MS` and restart launchd.

### When to drop it

If durations are consistently far below 15 min and you'd rather kill hangs faster, drop it. Trade-off: shorter timeout = faster recovery from hangs, but risks aborting legitimate slow runs.

### How to review duration data

```sql
-- Duration distribution over the last 30 days, per routine.
SELECT
  routine_name,
  count(*) AS runs,
  round(avg(extract(epoch FROM finished_at - started_at)))::int AS avg_sec,
  round(max(extract(epoch FROM finished_at - started_at)))::int AS max_sec,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at - started_at)))::int AS p95_sec
FROM routine_runs
WHERE status = 'completed'
  AND started_at > now() - interval '30 days'
GROUP BY routine_name
ORDER BY p95_sec DESC;

-- Any timeout-flagged failures?
SELECT id, routine_name, started_at, error_message
FROM routine_runs
WHERE error_message LIKE 'claude.timeout%'
ORDER BY started_at DESC
LIMIT 20;
```

Rule of thumb: set `DEFAULT_TIMEOUT_MS` to ~2× the p95 duration. Revisit monthly or when a routine's prompt/model changes.

## Troubleshooting

**Worker exits immediately with "ANTHROPIC_API_KEY is set":** remove it from
your `.env.local` and your shell. Run `unset ANTHROPIC_API_KEY` before
`pnpm worker`.

**"Claude returned no result text":** the Agent SDK couldn't get a response
from your Max session. Run `claude` interactively and verify it works. The
SDK can't refresh an expired OAuth token in headless mode — you may need to
log in again.

**Generator schedule misses a day:** the worker fires the scheduled generator
during a 5-minute window starting at 04:00 UTC. If your Mac was asleep at
that time, the run gets skipped. Click "Run now" from the dashboard to fire
it manually — same outcome.

**Stuck rows:** the worker's sweeper promotes any `accepted` row older than
30 min to `timed_out`. If something is wedged, wait 30 min or hit the
dashboard's "Cancel and re-fire" toast.
