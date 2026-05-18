import { logEvent } from "./log";

const RETRY_BACKOFF_MS = [1000, 4000];

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FireResult =
  | { ok: true; body: string }
  | { ok: false; status: number; body: string };

export async function fireRoutine(
  routineId: string | undefined,
  token: string | undefined,
): Promise<FireResult> {
  if (!routineId || !token) {
    return { ok: false, status: 500, body: "Routine ID or token missing" };
  }

  const maxAttempts = 1 + RETRY_BACKOFF_MS.length;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetch(
      `https://api.anthropic.com/v1/claude_code/routines/${routineId}/fire`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "anthropic-beta": "experimental-cc-routine-2026-04-01",
          "anthropic-version": "2023-06-01",
        },
        body: "{}",
      },
    );

    const body = await r.text();

    if (r.ok) {
      logEvent("info", "fire.attempt.ok", {
        routine_id: routineId,
        attempt,
        body_len: body.length,
      });
      return { ok: true, body };
    }

    const isFinalAttempt = attempt === maxAttempts;
    const shouldRetry = isRetryable(r.status) && !isFinalAttempt;

    if (!shouldRetry) {
      logEvent("error", "fire.attempt.final_fail", {
        routine_id: routineId,
        attempt,
        status: r.status,
        body,
      });
      return { ok: false, status: r.status, body };
    }

    const backoffMs = RETRY_BACKOFF_MS[attempt - 1];
    logEvent("warn", "fire.attempt.retry", {
      routine_id: routineId,
      attempt,
      status: r.status,
      backoff_ms: backoffMs,
    });
    await sleep(backoffMs);
  }

  throw new Error("fire-routine retry loop exited without returning");
}
