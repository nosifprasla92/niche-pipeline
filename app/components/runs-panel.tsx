"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import type { RoutineRun, RoutineRunStatus } from "@/lib/supabase";

type DotColor = "green" | "yellow" | "red" | "gray";

export const IN_FLIGHT_STATUSES: RoutineRunStatus[] = ["triggered", "accepted"];
export const FAILED_STATUSES: RoutineRunStatus[] = ["error", "fire_failed", "timed_out"];

// Internal aliases — keep call sites in this file short.
const IN_FLIGHT = IN_FLIGHT_STATUSES;
const FAILED = FAILED_STATUSES;

function computeDotColor(runs: RoutineRun[]): DotColor {
  if (runs.length === 0) return "gray";
  const byRoutine = new Map<string, RoutineRun[]>();
  for (const r of runs) {
    const list = byRoutine.get(r.routine_name) ?? [];
    list.push(r);
    byRoutine.set(r.routine_name, list);
  }
  for (const list of byRoutine.values()) {
    const lastFinished = list.find((r) => !IN_FLIGHT.includes(r.status));
    if (lastFinished && FAILED.includes(lastFinished.status)) return "red";
  }
  if (runs.some((r) => IN_FLIGHT.includes(r.status))) return "yellow";
  return "green";
}

function dotClasses(c: DotColor): string {
  switch (c) {
    case "green":
      return "bg-success";
    case "yellow":
      return "bg-warning animate-pulse";
    case "red":
      return "bg-error";
    case "gray":
      return "bg-border";
  }
}

function dotTitle(c: DotColor, runs: RoutineRun[]): string {
  if (c === "red") {
    const failed = runs.find(
      (r) => !IN_FLIGHT.includes(r.status) && FAILED.includes(r.status),
    );
    return failed
      ? `Most recent ${failed.routine_name} run failed (${failed.status})`
      : "A routine failed recently";
  }
  if (c === "yellow") {
    const inFlight = runs.find((r) => IN_FLIGHT.includes(r.status));
    return `${inFlight?.routine_name} routine in flight`;
  }
  if (c === "green") return "All routines healthy";
  return "No runs yet";
}

const STATUS_BADGE: Record<RoutineRunStatus, string> = {
  triggered: "bg-border text-muted",
  accepted: "bg-border text-warning",
  completed: "bg-border text-success",
  error: "bg-border text-error",
  fire_failed: "bg-border text-error",
  timed_out: "bg-border text-warning",
  cancelled: "bg-border text-muted",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function duration(start: string, end: string | null): string | null {
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec ? `${min}m ${remSec}s` : `${min}m`;
}

export function RunsPanel({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}) {
  const { data } = useSWR<{ runs: RoutineRun[] }>(
    "/api/routine-runs?limit=20",
    fetcher,
    { refreshInterval: 30000 },
  );
  const runs = data?.runs ?? [];
  const color = computeDotColor(runs);
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const actualOpen = isControlled ? open : internalOpen;
  const setOpen = (next: boolean) =>
    isControlled ? onOpenChange?.(next) : setInternalOpen(next);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-2.5 h-2.5 rounded-full ${dotClasses(color)} hover:ring-2 hover:ring-border cursor-pointer transition-shadow`}
        title={dotTitle(color, runs)}
        aria-label={dotTitle(color, runs)}
      />
      {actualOpen && <RunsDrawer runs={runs} onClose={() => setOpen(false)} />}
    </>
  );
}

function RunsDrawer({
  runs,
  onClose,
}: {
  runs: RoutineRun[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-md max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted">
            Recent routine runs
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-text text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        {runs.length === 0 ? (
          <div className="p-6 text-sm text-muted">No routine runs yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {runs.map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RunRow({ run }: { run: RoutineRun }) {
  const dur = duration(run.started_at, run.finished_at);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-sm font-medium">{run.routine_name}</span>
        <span
          className={`font-mono text-[0.6875rem] uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${STATUS_BADGE[run.status]}`}
        >
          {run.status}
        </span>
        <span className="font-mono text-xs text-muted">
          {timeAgo(run.started_at)}
          {dur && ` · ${dur}`}
          {run.triggered_by !== "callback" && ` · ${run.triggered_by}`}
        </span>
      </div>
      {run.summary && (
        <div className="text-xs text-muted leading-relaxed">
          {run.summary}
        </div>
      )}
      {run.error_message && (
        <div className="font-mono text-xs text-error mt-1">
          {run.error_message}
        </div>
      )}
    </div>
  );
}
