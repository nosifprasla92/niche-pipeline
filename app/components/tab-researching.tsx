"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea } from "@/lib/supabase";
import { Card } from "./card";
import { StatusPill } from "./status-pill";

export function TabResearching() {
  const { data, mutate } = useSWR<{ ideas: Idea[] }>(
    "/api/ideas?status=pursuing,researched",
    fetcher,
    { refreshInterval: 30000 },
  );
  const ideas = data?.ideas ?? [];

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (ideas.length === 0)
    return <div className="text-sm text-zinc-500">Nothing in research right now.</div>;

  return (
    <div className="space-y-4">
      {ideas.map((idea) => (
        <ResearchCard key={idea.id} idea={idea} onChange={() => mutate()} />
      ))}
    </div>
  );
}

function ResearchCard({ idea, onChange }: { idea: Idea; onChange: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  if (idea.status === "pursuing") {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-3">
          <StatusPill status={idea.status} />
          <span className="text-xs text-zinc-500">{formatDate(idea.updated_at)}</span>
        </div>
        <h3 className="text-lg font-semibold mb-1">{idea.title}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">{idea.description}</p>
        <div className="animate-pulse text-sm text-zinc-500">
          Deep research in progress… typically 2–5 minutes.
        </div>
      </Card>
    );
  }

  async function approve() {
    await fetch("/api/trigger-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea_id: idea.id }),
    });
    onChange();
  }

  async function reject() {
    await fetch("/api/update-idea", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: idea.id,
        patch: { status: "passed", passed_reason: reason },
        feedback: reason ? { pattern_type: "dislike", pattern: reason } : undefined,
      }),
    });
    onChange();
  }

  return (
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <StatusPill status={idea.status} />
        <span className="text-xs text-zinc-500">
          researched {idea.researched_at && formatDate(idea.researched_at)}
        </span>
      </div>
      <h3 className="text-lg font-semibold mb-1">{idea.title}</h3>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">{idea.description}</p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Metric label="Competition" value={`${idea.competition_score ?? "—"}/10`} />
        <Metric label="Effort" value={`${idea.effort_weeks ?? "—"} wks`} />
        <Metric
          label="Marketing 3mo"
          value={idea.marketing_cost_3mo ? `$${idea.marketing_cost_3mo.toLocaleString()}` : "—"}
        />
      </div>

      <Section title="Competitive landscape">{idea.competition_analysis}</Section>
      <Section title="Effort to launch">{idea.effort_breakdown}</Section>
      <Section title="Marketing spend">{idea.marketing_breakdown}</Section>

      {!rejecting ? (
        <div className="flex gap-2 mt-4">
          <button
            onClick={approve}
            className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700"
          >
            Approve plan
          </button>
          <button
            onClick={() => setRejecting(true)}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="flex gap-2 items-center mt-4">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (becomes a dislike pattern)"
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
          />
          <button
            onClick={reject}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          >
            Confirm
          </button>
          <button onClick={() => setRejecting(false)} className="text-sm text-zinc-500">
            Cancel
          </button>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-3">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{title}</div>
      <p className="text-sm">{children}</p>
    </div>
  );
}
