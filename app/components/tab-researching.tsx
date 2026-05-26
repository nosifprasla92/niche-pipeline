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
  const [killing, setKilling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function killPursuing() {
    setBusy(true);
    try {
      // Cancel the in-flight researcher run first so the UNIQUE invariant
      // doesn't permanently wedge this routine. cancel-run reverts the idea
      // to 'new'; the subsequent update-idea then moves it to 'killed'.
      // Tolerant of 404 — if no in-flight run exists (drift between idea
      // status and routine_runs), the update-idea below will still kill the
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
          patch: {
            status: "killed",
            kill_reason: reason || "cancelled during research",
            killed_at: new Date().toISOString(),
          },
          feedback: reason ? { pattern_type: "dislike", pattern: reason } : undefined,
        }),
      });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  if (idea.status === "pursuing") {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <StatusPill status={idea.status} />
          <span className="font-mono text-xs text-muted">{formatDate(idea.updated_at)}</span>
        </div>
        <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
        <p className="text-base text-text/90 leading-relaxed mb-5 whitespace-pre-line max-w-[65ch]">{idea.description}</p>
        <div className="animate-pulse font-mono text-xs uppercase tracking-wider text-muted mb-5">
          Deep research in progress… typically 2–5 minutes.
        </div>
        {!killing ? (
          <button
            onClick={() => setKilling(true)}
            className="px-4 py-1.5 text-sm rounded-md border border-border text-error hover:bg-border/50 transition-colors"
          >
            Kill
          </button>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional — becomes a dislike pattern)"
              className="w-full sm:flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2 items-center">
              <button
                onClick={killPursuing}
                disabled={busy}
                className="px-4 py-1.5 text-sm rounded-md bg-text text-bg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Confirm
              </button>
              <button onClick={() => setKilling(false)} className="text-sm text-muted hover:text-text">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  async function sendToValidation() {
    setBusy(true);
    try {
      const r = await fetch("/api/trigger-validate", {
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

  async function cancelAndValidate() {
    if (!conflict?.run_id) return;
    setCancelling(true);
    try {
      await fetch("/api/cancel-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: conflict.run_id }),
      });
      setConflict(null);
      await sendToValidation();
    } finally {
      setCancelling(false);
    }
  }

  async function killResearched() {
    setBusy(true);
    try {
      await fetch("/api/update-idea", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: idea.id,
          patch: {
            status: "killed",
            kill_reason: reason,
            killed_at: new Date().toISOString(),
          },
          feedback: reason ? { pattern_type: "dislike", pattern: reason } : undefined,
        }),
      });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const conflictTitle = conflict?.idea_title ?? "another idea";
  const message = `"${conflictTitle}" is already being validated. Cancel that to validate "${idea.title}" instead?`;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <StatusPill status={idea.status} />
        <span className="font-mono text-xs text-muted">
          researched {idea.researched_at && formatDate(idea.researched_at)}
        </span>
      </div>
      <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
      <p className="text-base text-text/90 leading-relaxed mb-5 whitespace-pre-line max-w-[65ch]">{idea.description}</p>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
        <Metric
          label="Competitors >$50"
          value={idea.competitors_above_50 != null ? String(idea.competitors_above_50) : "—"}
          tone={idea.competitors_above_50 != null && idea.competitors_above_50 <= 3 ? "positive" : idea.competitors_above_50 != null && idea.competitors_above_50 >= 10 ? "cautionary" : undefined}
        />
        <Metric
          label="Effort"
          value={`${idea.effort_weeks ?? "—"} wks`}
          tone={idea.effort_weeks != null && idea.effort_weeks <= 4 ? "positive" : idea.effort_weeks != null && idea.effort_weeks >= 10 ? "cautionary" : undefined}
        />
        <Metric
          label="Bracket"
          value={idea.income_bracket ?? "—"}
          tone={idea.income_bracket === "business" ? "positive" : idea.income_bracket === "lifestyle" ? "info" : undefined}
        />
      </div>

      <Section title="Competitive landscape" titleColor="text-muted">{idea.competition_analysis}</Section>
      <Section title="Competitor complaints" titleColor="text-warning">{idea.competitor_complaints}</Section>
      <Section title="Effort to launch" titleColor="text-muted">{idea.effort_breakdown}</Section>
      <Section title="Zero-paid path to first 10" titleColor="text-success">{idea.zero_paid_path}</Section>

      {!killing ? (
        <div className="flex gap-2 mt-5">
          <button
            onClick={sendToValidation}
            disabled={busy}
            className="px-4 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Send to validation
          </button>
          <button
            onClick={() => setKilling(true)}
            disabled={busy}
            className="px-4 py-1.5 text-sm rounded-md border border-border text-error hover:bg-border/50 transition-colors"
          >
            Kill
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center mt-5">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (becomes a dislike pattern)"
            className="w-full sm:flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2 items-center">
            <button
              onClick={killResearched}
              disabled={busy}
              className="px-4 py-1.5 text-sm rounded-md bg-text text-bg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Confirm
            </button>
            <button onClick={() => setKilling(false)} className="text-sm text-muted hover:text-text">
              Cancel
            </button>
          </div>
        </div>
      )}

      {conflict && (
        <ConflictToast
          message={message}
          cancelLabel="Cancel and validate"
          canCancel={conflict.run_id != null}
          cancelling={cancelling}
          onCancel={cancelAndValidate}
          onDismiss={() => setConflict(null)}
        />
      )}
    </Card>
  );
}

const METRIC_TONE = {
  positive: "text-success",
  cautionary: "text-warning",
  info: "text-info",
} as const;

function Metric({ label, value, tone }: { label: string; value: string; tone?: keyof typeof METRIC_TONE }) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className={`font-mono text-lg ${tone ? METRIC_TONE[tone] : ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, titleColor = "text-muted", children }: { title: string; titleColor?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-5">
      <div className={`font-mono text-[0.6875rem] uppercase tracking-wider ${titleColor} mb-2`}>{title}</div>
      <p className="text-sm leading-relaxed whitespace-pre-line max-w-[65ch]">{children}</p>
    </div>
  );
}
