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
    <div className="space-y-6 max-w-[720px]">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Suggested (30d)" value={suggested} />
        <Stat label="Pursued" value={pursued} />
        <Stat label="Launched" value={launched} />
      </div>

      <div className="border border-border rounded-md p-4 bg-surface">
        <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-2">Add pattern</div>
        <div className="flex gap-2">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as "like" | "dislike")}
            className="text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
          >
            <option value="dislike">Dislike</option>
            <option value="like">Like</option>
          </select>
          <input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder="e.g. avoid anything with physical inventory"
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
          />
          <button
            onClick={addPattern}
            className="px-4 py-1.5 text-sm rounded-md bg-text text-bg hover:opacity-90 transition-opacity"
          >
            Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PatternColumn
          title="What you like"
          tone="like"
          patterns={likes}
          onRemove={removePattern}
        />
        <PatternColumn
          title="What you avoid"
          tone="dislike"
          patterns={dislikes}
          onRemove={removePattern}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border rounded-md p-4 bg-surface">
      <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">{label}</div>
      <div className="font-display text-3xl">{value}</div>
    </div>
  );
}

function PatternColumn({
  title,
  tone,
  patterns,
  onRemove,
}: {
  title: string;
  tone: "like" | "dislike";
  patterns: FeedbackPattern[];
  onRemove: (id: number) => void;
}) {
  const accentText = tone === "like" ? "text-success" : "text-error";

  return (
    <div>
      <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-2">{title}</div>
      <div className="space-y-2">
        {patterns.length === 0 && (
          <div className="text-xs text-muted">None yet.</div>
        )}
        {patterns.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-sm border border-border bg-surface text-sm"
          >
            <span className={`truncate ${accentText}`}>{p.pattern}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-xs text-muted">×{p.confidence}</span>
              <button
                onClick={() => onRemove(p.id)}
                className="font-mono text-xs text-muted hover:text-text"
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
