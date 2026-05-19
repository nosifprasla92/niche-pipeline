"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea } from "@/lib/supabase";
import { TabInbox } from "./components/tab-inbox";
import { TabResearching } from "./components/tab-researching";
import { TabValidating } from "./components/tab-validating";
import { TabPlans } from "./components/tab-plans";
import { TabArchive } from "./components/tab-archive";
import { TabInsights } from "./components/tab-insights";
import { RunsPanel } from "./components/runs-panel";
import { ConflictToast, type Conflict } from "./components/conflict-toast";

const TABS = [
  { id: "inbox", label: "Inbox" },
  { id: "researching", label: "Researching" },
  { id: "validating", label: "Validating" },
  { id: "plans", label: "Plans" },
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
  const { data: inboxData } = useSWR<{ ideas: Idea[] }>("/api/ideas?status=new", fetcher, {
    refreshInterval: 30000,
  });
  const { data: allData } = useSWR<{ ideas: Idea[] }>("/api/ideas", fetcher, {
    refreshInterval: 30000,
  });

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

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-6 py-8">
      <header className="flex items-start justify-between mb-10">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Niche pipeline</h1>
          <p className="font-mono text-xs text-muted mt-2 uppercase tracking-wider">
            {subtitle}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-3">
            <RunsPanel />
            <button
              onClick={runNow}
              disabled={running}
              className="px-3 py-1.5 text-sm rounded-md border border-border text-text hover:bg-border/60 disabled:opacity-50"
            >
              {running ? "Running…" : "Run now"}
            </button>
          </div>
          {error && <span className="text-xs text-error">{error}</span>}
        </div>
      </header>

      <nav className="flex gap-1 mb-8 border-b border-border">
        {TABS.map((t) => {
          const count = pendingCounts[t.id] ?? 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
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

      <main>
        {tab === "inbox" && <TabInbox />}
        {tab === "researching" && <TabResearching />}
        {tab === "validating" && <TabValidating />}
        {tab === "plans" && <TabPlans />}
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
    </div>
  );
}
