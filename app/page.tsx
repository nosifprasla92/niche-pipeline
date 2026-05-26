"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea, RoutineRun } from "@/lib/supabase";
import { TabInbox } from "./components/tab-inbox";
import { TabResearching } from "./components/tab-researching";
import { TabValidating } from "./components/tab-validating";
import { TabPlans } from "./components/tab-plans";
import { TabInProgress } from "./components/tab-in-progress";
import { TabArchive } from "./components/tab-archive";
import { TabInsights } from "./components/tab-insights";
import {
  RunsPanel,
  IN_FLIGHT_STATUSES,
  FAILED_STATUSES,
} from "./components/runs-panel";
import { ConflictToast, type Conflict } from "./components/conflict-toast";
import { SpendToggle } from "./components/spend-toggle";
import { CostCard } from "./components/cost-card";

type FailingRoutine = { routine: string; count: number };

const COMPLETION_WINDOW_DAYS = 14;

function completionStats(runs: RoutineRun[]): {
  completed: number;
  finished: number;
} {
  const cutoff = Date.now() - COMPLETION_WINDOW_DAYS * 86400000;
  let completed = 0;
  let finished = 0;
  for (const r of runs) {
    if (Date.parse(r.started_at) <= cutoff) continue;
    if (IN_FLIGHT_STATUSES.includes(r.status)) continue;
    if (r.status === "cancelled") continue;
    finished++;
    if (r.status === "completed") completed++;
  }
  return { completed, finished };
}

function failingRoutines(runs: RoutineRun[], min = 2): FailingRoutine[] {
  const byRoutine = new Map<string, RoutineRun[]>();
  for (const r of runs) {
    const list = byRoutine.get(r.routine_name) ?? [];
    list.push(r);
    byRoutine.set(r.routine_name, list);
  }
  const out: FailingRoutine[] = [];
  for (const [routine, list] of byRoutine) {
    const finished = list.filter((r) => !IN_FLIGHT_STATUSES.includes(r.status));
    let consecutive = 0;
    for (const r of finished) {
      if (FAILED_STATUSES.includes(r.status)) consecutive++;
      else break;
    }
    if (consecutive >= min) out.push({ routine, count: consecutive });
  }
  return out;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const TABS = [
  { id: "inbox", label: "Inbox" },
  { id: "researching", label: "Researching" },
  { id: "validating", label: "Validating" },
  { id: "plans", label: "Plans" },
  { id: "in_progress", label: "In progress" },
  { id: "archive", label: "Archive" },
  { id: "insights", label: "Insights" },
] as const;

type TabId = typeof TABS[number]["id"];

function headerSubtitle({
  lastNew,
  totalIdeas,
  ideasThisMonth,
}: {
  lastNew: Idea | undefined;
  totalIdeas: number;
  ideasThisMonth: number;
}): string {
  const schedule = "daily at 8:00 AM";
  if (lastNew) return `Last idea ${formatDate(lastNew.created_at)} · ${schedule}`;
  if (totalIdeas > 0) return `Inbox empty · ${ideasThisMonth} ideas this month · next run 8:00 AM`;
  return `Waiting for first run · ${schedule}`;
}

export default function Home() {
  const [tab, setTab] = useState<TabId>("inbox");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [runningPm, setRunningPm] = useState(false);
  const [pmError, setPmError] = useState<string | null>(null);
  const [pmConflict, setPmConflict] = useState<Conflict | null>(null);
  const [pmCancelling, setPmCancelling] = useState(false);
  const { data: inboxData } = useSWR<{ ideas: Idea[] }>("/api/ideas?status=new", fetcher, {
    refreshInterval: 30000,
  });
  const { data: allData } = useSWR<{ ideas: Idea[] }>("/api/ideas", fetcher, {
    refreshInterval: 30000,
  });
  const { data: runsData } = useSWR<{ runs: RoutineRun[] }>(
    "/api/routine-runs?limit=20",
    fetcher,
    { refreshInterval: 30000 },
  );
  const inFlight = runsData?.runs?.find((r) =>
    IN_FLIGHT_STATUSES.includes(r.status),
  );
  const failing = failingRoutines(runsData?.runs ?? []);
  const completion = completionStats(runsData?.runs ?? []);
  const [runsOpen, setRunsOpen] = useState(false);

  const lastNew = inboxData?.ideas?.[0];
  const allIdeas = allData?.ideas ?? [];
  const monthAgo = Date.now() - 30 * 86400000;
  const ideasThisMonth = allIdeas.filter((i) => Date.parse(i.created_at) > monthAgo).length;
  const subtitle = headerSubtitle({
    lastNew,
    totalIdeas: allIdeas.length,
    ideasThisMonth,
  });
  const pendingCounts: Partial<Record<TabId, number>> = {
    inbox: allIdeas.filter((i) => i.status === "new").length,
    researching: allIdeas.filter((i) => i.status === "researched").length,
    validating: allIdeas.filter((i) => i.status === "validated").length,
    plans: allIdeas.filter((i) => i.status === "plan_ready").length,
    in_progress: allIdeas.filter((i) => i.status === "in_progress").length,
  };

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      const r = await fetch("/api/run-generator", { method: "POST" });
      if (r.status === 409) {
        const body = await r.json();
        setConflict(body.conflict);
        return;
      }
      if (!r.ok) {
        const t = await r.json();
        setError(t.error || "Failed");
      }
    } finally {
      setRunning(false);
    }
  }

  async function cancelAndRetry() {
    if (!conflict?.run_id) return;
    setCancelling(true);
    try {
      await fetch("/api/cancel-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: conflict.run_id }),
      });
      setConflict(null);
      await runNow();
    } finally {
      setCancelling(false);
    }
  }

  async function runPostmortem() {
    setRunningPm(true);
    setPmError(null);
    try {
      const r = await fetch("/api/run-postmortem", { method: "POST" });
      if (r.status === 409) {
        const body = await r.json();
        setPmConflict(body.conflict);
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setPmError(body.error || `HTTP ${r.status}`);
      }
    } finally {
      setRunningPm(false);
    }
  }

  async function cancelAndRerunPm() {
    if (!pmConflict?.run_id) return;
    setPmCancelling(true);
    try {
      await fetch("/api/cancel-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: pmConflict.run_id }),
      });
      setPmConflict(null);
      await runPostmortem();
    } finally {
      setPmCancelling(false);
    }
  }

  return (
    <div className="min-h-screen w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
      <header className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-y-4 mb-8 sm:mb-10">
        <div>
          <h1 className="font-display text-2xl sm:text-4xl tracking-tight">Niche pipeline</h1>
          {inFlight ? (
            <p className="font-mono text-xs mt-2 uppercase tracking-wider flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-warning animate-pulse" />
              <span className="text-warning">
                {inFlight.routine_name} running · started {timeAgo(inFlight.started_at)}
              </span>
            </p>
          ) : (
            <p className="font-mono text-xs text-muted mt-2 uppercase tracking-wider">
              {subtitle}
            </p>
          )}
          {completion.finished > 0 && (
            <p
              className={`font-mono text-xs mt-1 uppercase tracking-wider ${
                completion.completed / completion.finished < 0.5
                  ? "text-error"
                  : "text-muted"
              }`}
            >
              {completion.completed}/{completion.finished} completed · last{" "}
              {COMPLETION_WINDOW_DAYS}d
            </p>
          )}
          <div className="mt-3">
            <CostCard />
          </div>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <SpendToggle />
            <RunsPanel open={runsOpen} onOpenChange={setRunsOpen} />
            <button
              onClick={runPostmortem}
              disabled={runningPm}
              title="Cluster killed-idea reasons from the last 14 days into new dislike patterns"
              className="px-3 py-2 text-sm rounded-md border border-border text-muted hover:text-text hover:bg-border/60 disabled:opacity-50"
            >
              {runningPm ? "Running…" : "Run post-mortem"}
            </button>
            <button
              onClick={runNow}
              disabled={running}
              className="px-3 py-2 text-sm rounded-md border border-border text-text hover:bg-border/60 disabled:opacity-50"
            >
              {running ? "Running…" : "Run now"}
            </button>
          </div>
          {error && <span className="text-xs text-error">{error}</span>}
          {pmError && <span className="text-xs text-error">{pmError}</span>}
        </div>
      </header>

      {failing.length > 0 && (
        <div className="mb-6 space-y-1.5">
          {failing.map((f) => (
            <button
              key={f.routine}
              onClick={() => setRunsOpen(true)}
              className="w-full flex items-center justify-between gap-3 text-left px-4 py-2.5 rounded-md border border-error/40 bg-error/5 hover:bg-error/10 transition-colors"
            >
              <span className="text-sm text-error">
                <span className="font-mono uppercase tracking-wider text-xs">
                  {f.routine}
                </span>{" "}
                failing — {f.count} errored runs
              </span>
              <span className="font-mono text-xs text-error/80">
                View details →
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="relative mb-6 sm:mb-8 -mx-4 sm:mx-0">
        <nav
          className="flex gap-0.5 sm:gap-1 border-b border-border overflow-x-auto min-w-0 px-4 sm:px-0"
          style={{ scrollbarWidth: "none" }}
        >
          {TABS.map((t) => {
            const count = pendingCounts[t.id] ?? 0;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 whitespace-nowrap px-3 sm:px-4 py-3.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.id
                    ? "border-text text-text"
                    : "border-transparent text-muted hover:text-text"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className="ml-1.5 font-mono text-[0.6875rem] px-1.5 py-0.5 rounded-sm bg-border text-text"
                    aria-label={`${count} pending`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="absolute right-0 top-0 bottom-px w-8 bg-gradient-to-l from-bg to-transparent pointer-events-none sm:hidden" />
      </div>

      <main>
        {tab === "inbox" && <TabInbox />}
        {tab === "researching" && <TabResearching />}
        {tab === "validating" && <TabValidating />}
        {tab === "plans" && <TabPlans />}
        {tab === "in_progress" && <TabInProgress />}
        {tab === "archive" && <TabArchive />}
        {tab === "insights" && <TabInsights />}
      </main>

      {conflict && (
        <ConflictToast
          message="The generator is already running. Cancel that run to start a new one?"
          cancelLabel="Cancel running and re-fire"
          canCancel={conflict.run_id != null}
          cancelling={cancelling}
          onCancel={cancelAndRetry}
          onDismiss={() => setConflict(null)}
        />
      )}
      {pmConflict && (
        <ConflictToast
          message="The post-mortem routine is already running. Cancel that run and start a new one?"
          cancelLabel="Cancel running and re-fire"
          canCancel={pmConflict.run_id != null}
          cancelling={pmCancelling}
          onCancel={cancelAndRerunPm}
          onDismiss={() => setPmConflict(null)}
        />
      )}
    </div>
  );
}
