export async function fireRoutine(
  routineId: string | undefined,
  token: string | undefined,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!routineId || !token) {
    return { ok: false, status: 500, error: "Routine ID or token missing" };
  }

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

  if (!r.ok) {
    const text = await r.text();
    console.error(`[fire-routine] ${routineId} → ${r.status}`, text);
    return { ok: false, status: r.status, error: text };
  }
  const body = await r.text();
  console.log(`[fire-routine] ${routineId} → ok ${body}`);
  return { ok: true };
}
