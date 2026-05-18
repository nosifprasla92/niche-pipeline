"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea } from "@/lib/supabase";
import { Card } from "./card";
import { StatusPill } from "./status-pill";
import { ConflictToast, type Conflict } from "./conflict-toast";

export function TabResearching() {
  const { data, mutate } = useSWR<{ ideas: Idea[] }>(
    "/api/ideas?status=pursuing,researched",
    fetcher,
    { refreshInterval: 30000 },
  );
  const ideas = data?.ideas ?? [];

  if (!data) return <div className="text-sm text-muted">Loading…</div>;
  if (ideas.length === 0)
    return <div className="text-sm text-muted">Nothing in research right now.</div>;

  return (
    <div className="space-y-6 max-w-[720px]">
      {ideas.map((idea) => (
        <ResearchCard key={idea.id} idea={idea} onChange={() => mutate()} />
      ))}
    </div>
  );
}

function ResearchCard({ idea, onChange }: { idea: Idea; onChange: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function rejectPursuing() {
    // Cancel the in-flight researcher run first so the UNIQUE invariant
    // doesn't permanently wedge this routine. cancel-run reverts the idea
    // to 'new'; the subsequent update-idea then moves it to 'passed'.
    // Tolerant of 404 — if no in-flight run exists (drift between idea
    // status and routine_runs), the update-idea below will still pass the
    // idea correctly.
    await fetch("/api/cancel-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea_id: idea.id }),
    });
    await fetch("/api/update-idea", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: idea.id,
        patch: { status: "passed", passed_reason: reason || "cancelled during research" },
        feedback: reason ? { pattern_type: "dislike", pattern: reason } : undefined,
      }),
    });
    onChange();
  }

  if (idea.status === "pursuing") {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <StatusPill status={idea.status} />
          <span className="font-mono text-xs text-muted">{formatDate(idea.updated_at)}</span>
        </div>
        <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
        <p className="text-base text-text/90 leading-relaxed mb-5">{idea.description}</p>
        <div className="animate-pulse font-mono text-xs uppercase tracking-wider text-muted mb-5">
          Deep research in progress… typically 2–5 minutes.
        </div>
        {!rejecting ? (
          <button
            onClick={() => setRejecting(true)}
            className="px-4 py-1.5 text-sm rounded-md border border-border text-text hover:bg-border/50 transition-colors"
          >
            Archive
          </button>
        ) : (
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional — becomes a dislike pattern)"
              className="flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
            />
            <button
              onClick={rejectPursuing}
              className="px-4 py-1.5 text-sm rounded-md bg-text text-bg hover:opacity-90 transition-opacity"
            >
              Confirm
            </button>
            <button onClick={() => setRejecting(false)} className="text-sm text-muted hover:text-text">
              Cancel
            </button>
          </div>
        )}
      </Card>
    );
  }

  async function approve() {
    setBusy(true);
    try {
      const r = await fetch("/api/trigger-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea_id: idea.id }),
      });
      if (r.status === 409) {
        const body = await r.json();
        setConflict(body.conflict);
        return;
      }
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function cancelAndPlan() {
    if (!conflict?.run_id) return;
    setCancelling(true);
    try {
      await fetch("/api/cancel-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: conflict.run_id }),
      });
      setConflict(null);
      await approve();
    } finally {
      setCancelling(false);
    }
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

  const conflictTitle = conflict?.idea_title ?? "another idea";
  const message = `"${conflictTitle}" is already being planned. Cancel that to plan "${idea.title}" instead?`;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <StatusPill status={idea.status} />
        <span className="font-mono text-xs text-muted">
          researched {idea.researched_at && formatDate(idea.researched_at)}
        </span>
      </div>
      <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
      <p className="text-base text-text/90 leading-relaxed mb-5">{idea.description}</p>

      <div className="grid grid-cols-3 gap-3 mb-5">
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
        <div className="flex gap-2 mt-5">
          <button
            onClick={approve}
            disabled={busy}
            className="px-4 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Approve plan
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="px-4 py-1.5 text-sm rounded-md border border-border text-text hover:bg-border/50 transition-colors"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="flex gap-2 items-center mt-5">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (becomes a dislike pattern)"
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
          />
          <button
            onClick={reject}
            className="px-4 py-1.5 text-sm rounded-md bg-text text-bg hover:opacity-90 transition-opacity"
          >
            Confirm
          </button>
          <button onClick={() => setRejecting(false)} className="text-sm text-muted hover:text-text">
            Cancel
          </button>
        </div>
      )}

      {conflict && (
        <ConflictToast
          message={message}
          cancelLabel="Cancel and plan"
          canCancel={conflict.run_id != null}
          cancelling={cancelling}
          onCancel={cancelAndPlan}
          onDismiss={() => setConflict(null)}
        />
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className="font-mono text-lg">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-4">
      <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">{title}</div>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  );
}
