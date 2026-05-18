"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import { FeedbackPattern, Idea } from "@/lib/supabase";

export function TabInsights() {
  const { data: pdata, mutate: mutateP } = useSWR<{ patterns: FeedbackPattern[] }>(
    "/api/patterns",
    fetcher,
    { refreshInterval: 30000 },
  );
  const { data: idata } = useSWR<{ ideas: Idea[] }>("/api/ideas", fetcher, {
    refreshInterval: 30000,
  });
  const [newPattern, setNewPattern] = useState("");
  const [newType, setNewType] = useState<"like" | "dislike">("dislike");

  const patterns = pdata?.patterns ?? [];
  const likes = patterns.filter((p) => p.pattern_type === "like");
  const dislikes = patterns.filter((p) => p.pattern_type === "dislike");

  const ideas = idata?.ideas ?? [];
  const last30 = (since: number) =>
    ideas.filter((i) => Date.parse(i.created_at) > Date.now() - since * 86400000);
  const recent = last30(30);
  const suggested = recent.length;
  const pursued = recent.filter((i) =>
    ["pursuing", "researched", "planning", "plan_ready", "in_progress", "launched"].includes(
      i.status,
    ),
  ).length;
  const launched = recent.filter((i) => i.status === "launched").length;

  async function addPattern() {
    if (!newPattern.trim()) return;
    await fetch("/api/patterns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pattern_type: newType, pattern: newPattern.trim() }),
    });
    setNewPattern("");
    mutateP();
  }

  async function removePattern(id: number) {
    await fetch(`/api/patterns?id=${id}`, { method: "DELETE" });
    mutateP();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Suggested (30d)" value={suggested} />
        <Stat label="Pursued" value={pursued} />
        <Stat label="Launched" value={launched} />
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <div className="text-sm font-medium mb-2">Add pattern</div>
        <div className="flex gap-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as "like" | "dislike")}
            className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
          >
            <option value="dislike">Dislike</option>
            <option value="like">Like</option>
          </select>
          <input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder="e.g. avoid anything with physical inventory"
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
          />
          <button
            onClick={addPattern}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          >
            Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PatternColumn
          title="What you like"
          color="green"
          patterns={likes}
          onRemove={removePattern}
        />
        <PatternColumn
          title="What you avoid"
          color="red"
          patterns={dislikes}
          onRemove={removePattern}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-4">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function PatternColumn({
  title,
  color,
  patterns,
  onRemove,
}: {
  title: string;
  color: "green" | "red";
  patterns: FeedbackPattern[];
  onRemove: (id: number) => void;
}) {
  const colorClasses =
    color === "green"
      ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100"
      : "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100";

  return (
    <div>
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="space-y-2">
        {patterns.length === 0 && (
          <div className="text-xs text-zinc-500">None yet.</div>
        )}
        {patterns.map((p) => (
          <div
            key={p.id}
            className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-full text-sm ${colorClasses}`}
          >
            <span className="truncate">{p.pattern}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs opacity-70">×{p.confidence}</span>
              <button
                onClick={() => onRemove(p.id)}
                className="text-xs opacity-60 hover:opacity-100"
              >
                remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
