"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import type { RoutineRun, RoutineRunStatus } from "@/lib/supabase";

type DotColor = "green" | "yellow" | "red" | "gray";

const IN_FLIGHT: RoutineRunStatus[] = ["triggered", "accepted"];
const FAILED: RoutineRunStatus[] = ["error", "fire_failed", "timed_out"];

function computeDotColor(runs: RoutineRun[]): DotColor {
  if (runs.length === 0) return "gray";
  if (runs.some((r) => IN_FLIGHT.includes(r.status))) return "yellow";
  if (FAILED.includes(runs[0].status)) return "red";
  return "green";
}

function dotClasses(c: DotColor): string {
  switch (c) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-500 animate-pulse";
    case "red":
      return "bg-red-500";
    case "gray":
      return "bg-zinc-300 dark:bg-zinc-700";
  }
}

function dotTitle(c: DotColor, runs: RoutineRun[]): string {
  if (c === "yellow") {
    const inFlight = runs.find((r) => IN_FLIGHT.includes(r.status));
    return `${inFlight?.routine_name} routine in flight`;
  }
  if (c === "red") return `Most recent run errored (${runs[0].routine_name})`;
  if (c === "green") return "All routines healthy";
  return "No runs yet";
}

const STATUS_BADGE: Record<RoutineRunStatus, string> = {
  triggered: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  accepted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  fire_failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  timed_out: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  cancelled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
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

export function RunsPanel() {
  const { data } = useSWR<{ runs: RoutineRun[] }>(
    "/api/routine-runs?limit=20",
    fetcher,
    { refreshInterval: 30000 },
  );
  const runs = data?.runs ?? [];
  const color = computeDotColor(runs);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-2.5 h-2.5 rounded-full ${dotClasses(color)} hover:ring-2 hover:ring-zinc-300 dark:hover:ring-zinc-700 cursor-pointer transition-shadow`}
        title={dotTitle(color, runs)}
        aria-label={dotTitle(color, runs)}
      />
      {open && <RunsDrawer runs={runs} onClose={() => setOpen(false)} />}
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
        className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold tracking-tight">
            Recent routine runs
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        {runs.length === 0 ? (
          <div className="p-6 text-sm text-zinc-500">No routine runs yet.</div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
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
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">{run.routine_name}</span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${STATUS_BADGE[run.status]}`}
        >
          {run.status}
        </span>
        <span className="text-xs text-zinc-500">
          {timeAgo(run.started_at)}
          {dur && ` · ${dur}`}
          {run.triggered_by !== "callback" && ` · ${run.triggered_by}`}
        </span>
      </div>
      {run.summary && (
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          {run.summary}
        </div>
      )}
      {run.error_message && (
        <div className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
          {run.error_message}
        </div>
      )}
    </div>
  );
}
