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
      console.log(`[fire-routine] ${routineId} attempt=${attempt} ok ${body}`);
      return { ok: true, body };
    }

    const isFinalAttempt = attempt === maxAttempts;
    const shouldRetry = isRetryable(r.status) && !isFinalAttempt;

    if (!shouldRetry) {
      console.error(
        `[fire-routine] ${routineId} attempt=${attempt} → ${r.status} (final)`,
        body,
      );
      return { ok: false, status: r.status, body };
    }

    const backoffMs = RETRY_BACKOFF_MS[attempt - 1];
    console.warn(
      `[fire-routine] ${routineId} attempt=${attempt} → ${r.status} (retrying in ${backoffMs}ms)`,
    );
    await sleep(backoffMs);
  }

  throw new Error("fire-routine retry loop exited without returning");
}
