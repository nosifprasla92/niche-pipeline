"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/fetcher";
import { FeedbackPattern, Idea } from "@/lib/supabase";

type Profile = {
  summary: string;
  generated_at: string | null;
  pattern_count: number;
  idea_count: number;
};

export function TabInsights() {
  const { data: pdata, mutate: mutateP } = useSWR<{ patterns: FeedbackPattern[] }>(
    "/api/patterns",
    fetcher,
    { refreshInterval: 30000 },
  );
  const { data: idata } = useSWR<{ ideas: Idea[] }>("/api/ideas", fetcher, {
    refreshInterval: 30000,
  });
  const { data: profileData } = useSWR<{ profile: Profile }>(
    "/api/profile",
    fetcher,
    { refreshInterval: 60000 },
  );
  const profile = profileData?.profile;
  const [newPattern, setNewPattern] = useState("");
  const [newType, setNewType] = useState<"like" | "dislike">("dislike");
  const [adding, setAdding] = useState(false);

  const patterns = pdata?.patterns ?? [];
  const likes = patterns.filter((p) => p.pattern_type === "like");
  const dislikes = patterns.filter((p) => p.pattern_type === "dislike");

  const ideas = idata?.ideas ?? [];
  const last30 = (since: number) =>
    ideas.filter((i) => Date.parse(i.created_at) > Date.now() - since * 86400000);
  const recent = last30(30);
  const suggested = recent.length;
  const pursued = recent.filter((i) =>
    [
      "pursuing",
      "researched",
      "validating",
      "validated",
      "planning",
      "plan_ready",
      "launched",
    ].includes(i.status),
  ).length;
  const validated = recent.filter((i) =>
    ["validated", "planning", "plan_ready", "launched"].includes(i.status),
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
    setAdding(false);
    mutateP();
  }

  async function removePattern(id: number) {
    await fetch(`/api/patterns?id=${id}`, { method: "DELETE" });
    mutateP();
  }

  const funnelMoved = pursued + validated + launched > 0;

  return (
    <div className="space-y-8 max-w-[720px]">
      {funnelMoved ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <Stat label="Suggested (30d)" value={suggested} tone="muted" />
          <Stat label="Pursued" value={pursued} tone="accent" />
          <Stat label="Validated" value={validated} tone="info" />
          <Stat label="Launched" value={launched} tone="success" />
        </div>
      ) : suggested > 0 ? (
        <div className="font-mono text-xs text-muted uppercase tracking-wider">
          Last 30 days · {suggested} suggested · none pursued yet
        </div>
      ) : null}

      {profile?.summary ? (
        <div className="space-y-2">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-accent flex items-baseline justify-between">
            <span>Profile</span>
            {profile.generated_at && (
              <span>{relativeTime(profile.generated_at)}</span>
            )}
          </div>
          <p className="font-display text-lg leading-relaxed text-text whitespace-pre-wrap">
            {profile.summary}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
        <PatternColumn
          title="Likes"
          count={likes.length}
          tone="like"
          patterns={likes}
          onRemove={removePattern}
        />
        <PatternColumn
          title="Avoids"
          count={dislikes.length}
          tone="dislike"
          patterns={dislikes}
          onRemove={removePattern}
        />
      </div>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="text-sm text-muted hover:text-text transition-colors"
        >
          + Add preference
        </button>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex gap-2 items-center">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "like" | "dislike")}
              className="text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
            >
              <option value="dislike">Avoid</option>
              <option value="like">Like</option>
            </select>
          </div>
          <input
            autoFocus
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder="e.g. avoid anything with physical inventory"
            className="w-full sm:flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2 items-center">
            <button
              onClick={addPattern}
              className="px-4 py-2 text-sm rounded-md bg-text text-bg hover:opacity-90 transition-opacity"
            >
              Add
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setNewPattern("");
              }}
              className="text-sm text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const STAT_TONE: Record<string, string> = {
  muted: "",
  accent: "text-accent",
  info: "text-info",
  success: "text-success",
};

function Stat({ label, value, tone = "muted" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="border border-border rounded-md p-3 sm:p-4 bg-surface">
      <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">{label}</div>
      <div className={`font-display text-2xl sm:text-3xl ${value > 0 ? (STAT_TONE[tone] ?? "") : ""}`}>{value}</div>
    </div>
  );
}

function PatternColumn({
  title,
  count,
  tone,
  patterns,
  onRemove,
}: {
  title: string;
  count: number;
  tone: "like" | "dislike";
  patterns: FeedbackPattern[];
  onRemove: (id: number) => void;
}) {
  const accentText = tone === "like" ? "text-success" : "text-error";
  const headerColor = tone === "like" ? "text-success" : "text-error";
  const borderColor = tone === "like" ? "border-success/30" : "border-error/30";

  return (
    <div>
      <div className={`font-mono text-[0.6875rem] uppercase tracking-wider mb-3 pb-2 border-b ${borderColor} flex items-baseline justify-between`}>
        <span className={headerColor}>{title}</span>
        <span className="text-muted">{count}</span>
      </div>
      <div className="space-y-1">
        {patterns.length === 0 && (
          <div className="text-xs text-muted py-1">None yet.</div>
        )}
        {patterns.map((p) => (
          <div
            key={p.id}
            className="group flex items-center justify-between gap-2 py-1.5 text-sm"
          >
            <span className={`line-clamp-2 ${accentText}`}>{p.pattern}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onRemove(p.id)}
                className="font-mono text-xs text-muted hover:text-text opacity-0 group-hover:opacity-100 transition-opacity"
              >
                remove
              </button>
              {p.confidence > 1 && (
                <span className="font-mono text-xs text-muted">×{p.confidence}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
