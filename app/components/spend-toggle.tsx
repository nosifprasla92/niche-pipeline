"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

type SpendInspection = {
  blocked: boolean;
  halt_env: boolean;
  kill_switch: boolean;
  daily: { count: number | null; cap: number; blocked: boolean };
};

export function SpendToggle() {
  const { data, mutate, isLoading } = useSWR<SpendInspection>(
    "/api/spend-status",
    fetcher,
    { refreshInterval: 30000 },
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = data?.blocked ?? false;
  const pillClasses = blocked
    ? "border-error/50 bg-error/10 text-error"
    : "border-success/50 bg-success/10 text-success";
  const dotClasses = blocked ? "bg-error" : "bg-success";
  const label = isLoading
    ? "AI ?"
    : blocked
      ? "AI HALTED"
      : "AI LIVE";

  async function toggleKillSwitch(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/spend-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kill_switch: next }),
      });
      if (!r.ok) {
        const t = await r.json().catch(() => ({}));
        setError(t.error || `HTTP ${r.status}`);
        return;
      }
      const fresh = (await r.json()) as SpendInspection;
      await mutate(fresh, { revalidate: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={blocked ? "Click to see why spending is halted" : "All brakes off — AI calls are live"}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md border font-mono text-[0.6875rem] uppercase tracking-wider hover:opacity-80 ${pillClasses}`}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClasses}`} />
        {label}
      </button>
      {open && data && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 pt-8 sm:p-4 sm:pt-16"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-surface border border-border rounded-md max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-mono text-xs uppercase tracking-wider text-muted">
                Spend brakes
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-text text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="p-4 space-y-4 text-sm">
              <BrakeRow
                label="HALT_ALL_AI env var"
                state={data.halt_env ? "blocking" : "off"}
                hint={
                  data.halt_env
                    ? "Set in Vercel. Unset and redeploy to release."
                    : "Set HALT_ALL_AI=1 in Vercel for an instant global halt."
                }
              />
              <BrakeRow
                label="pipeline_profile.kill_switch"
                state={data.kill_switch ? "blocking" : "off"}
                hint="Persistent DB brake. Toggle below."
                control={
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleKillSwitch(!data.kill_switch)}
                    className={`px-2.5 py-1 text-xs rounded-md border disabled:opacity-50 ${
                      data.kill_switch
                        ? "border-success/50 text-success hover:bg-success/10"
                        : "border-error/50 text-error hover:bg-error/10"
                    }`}
                  >
                    {busy
                      ? "…"
                      : data.kill_switch
                        ? "Release kill switch"
                        : "Engage kill switch"}
                  </button>
                }
              />
              <BrakeRow
                label="Daily routine_runs cap"
                state={
                  data.daily.blocked
                    ? "blocking"
                    : data.daily.count == null
                      ? "unknown"
                      : "off"
                }
                hint={
                  data.daily.count == null
                    ? "Counter read failed; brake won't engage today."
                    : `${data.daily.count} of ${data.daily.cap} used today (UTC). Override with AI_DAILY_CALL_LIMIT.`
                }
              />
              {error && (
                <p className="text-xs text-error font-mono">{error}</p>
              )}
              <p className="text-xs text-muted">
                ingest-source respects env + kill switch but skips the daily
                cap (it doesn&apos;t write to routine_runs).
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BrakeRow({
  label,
  state,
  hint,
  control,
}: {
  label: string;
  state: "off" | "blocking" | "unknown";
  hint: string;
  control?: React.ReactNode;
}) {
  const dot =
    state === "blocking"
      ? "bg-error"
      : state === "unknown"
        ? "bg-warning"
        : "bg-success";
  const stateLabel =
    state === "blocking" ? "BLOCKING" : state === "unknown" ? "UNKNOWN" : "OFF";
  return (
    <div className="flex items-start gap-3">
      <span className={`inline-block w-2 h-2 rounded-full mt-1.5 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <code className="text-xs font-mono">{label}</code>
          <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted">
            {stateLabel}
          </span>
        </div>
        <p className="text-xs text-muted mt-1">{hint}</p>
        {control && <div className="mt-2">{control}</div>}
      </div>
    </div>
  );
}
