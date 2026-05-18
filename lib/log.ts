type Level = "info" | "warn" | "error";

/**
 * Emit one structured JSON log line. Vercel surfaces these as plain text
 * lines, but JSON makes them filterable in log search ("event":"trigger.start"
 * or "run_id":1234).
 *
 * Convention: event names are dotted, lowercase, describing the lifecycle
 * point (e.g. fire.attempt, callback.idempotent, trigger.conflict).
 */
export function logEvent(
  level: Level,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
