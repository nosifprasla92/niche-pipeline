"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea } from "@/lib/supabase";
import { TabInbox } from "./components/tab-inbox";
import { TabResearching } from "./components/tab-researching";
import { TabPlans } from "./components/tab-plans";
import { TabArchive } from "./components/tab-archive";
import { TabInsights } from "./components/tab-insights";

const TABS = [
  { id: "inbox", label: "Inbox" },
  { id: "researching", label: "Researching" },
  { id: "plans", label: "Plans" },
  { id: "archive", label: "Archive" },
  { id: "insights", label: "Insights" },
] as const;

type TabId = typeof TABS[number]["id"];

export default function Home() {
  const [tab, setTab] = useState<TabId>("inbox");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = useSWR<{ ideas: Idea[] }>("/api/ideas?status=new", fetcher, {
    refreshInterval: 30000,
  });

  const lastNew = data?.ideas?.[0];

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      const r = await fetch("/api/run-generator", { method: "POST" });
      if (!r.ok) {
        const t = await r.json();
        setError(t.error || "Failed");
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-6 py-8">
      <header className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Niche pipeline</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {lastNew
              ? `Last idea ${formatDate(lastNew.created_at)}`
              : "Waiting for first run"}
            {" · daily at 8:00 AM"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={runNow}
            disabled={running}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {running ? "Running…" : "Run now"}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </header>

      <nav className="flex gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.id
                ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === "inbox" && <TabInbox />}
        {tab === "researching" && <TabResearching />}
        {tab === "plans" && <TabPlans />}
        {tab === "archive" && <TabArchive />}
        {tab === "insights" && <TabInsights />}
      </main>
    </div>
  );
}
