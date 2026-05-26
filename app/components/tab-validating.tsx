"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea } from "@/lib/supabase";
import { Card } from "./card";
import { StatusPill } from "./status-pill";
import { ConflictToast, type Conflict } from "./conflict-toast";

export function TabValidating() {
  const { data, mutate } = useSWR<{ ideas: Idea[] }>(
    "/api/ideas?status=validating,validated",
    fetcher,
    { refreshInterval: 30000 },
  );
  const ideas = data?.ideas ?? [];

  if (!data) return <div className="text-sm text-muted">Loading…</div>;
  if (ideas.length === 0)
    return (
      <div className="text-sm text-muted">
        Nothing in validation right now.
      </div>
    );

  return (
    <div className="space-y-6 max-w-[720px]">
      {ideas.map((idea) => (
        <ValidateCard key={idea.id} idea={idea} onChange={() => mutate()} />
      ))}
    </div>
  );
}

function ValidateCard({ idea, onChange }: { idea: Idea; onChange: () => void }) {
  const [killing, setKilling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function killValidating() {
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
          kill_reason: reason || "cancelled during validation",
          killed_at: new Date().toISOString(),
        },
        feedback: reason ? { pattern_type: "dislike", pattern: reason } : undefined,
      }),
    });
    onChange();
  }

  if (idea.status === "validating") {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <StatusPill status={idea.status} />
          <span className="font-mono text-xs text-muted">{formatDate(idea.updated_at)}</span>
        </div>
        <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
        <p className="text-base text-text/90 leading-relaxed mb-5 whitespace-pre-line max-w-[65ch]">{idea.description}</p>
        <div className="animate-pulse font-mono text-xs uppercase tracking-wider text-muted mb-5">
          Building validation kit… typically 2–4 minutes.
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
                onClick={killValidating}
                className="px-4 py-1.5 text-sm rounded-md bg-text text-bg hover:opacity-90 transition-opacity"
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

  async function approvePlan() {
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
      await approvePlan();
    } finally {
      setCancelling(false);
    }
  }

  async function killValidated() {
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
  }

  const conflictTitle = conflict?.idea_title ?? "another idea";
  const message = `"${conflictTitle}" is already being planned. Cancel that to plan "${idea.title}" instead?`;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <StatusPill status={idea.status} />
        <span className="font-mono text-xs text-muted">
          validated {idea.validated_at && formatDate(idea.validated_at)}
        </span>
      </div>
      <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
      <p className="text-base text-text/90 leading-relaxed mb-5 whitespace-pre-line max-w-[65ch]">{idea.description}</p>

      <Section title="Landing page copy" titleColor="text-accent">{idea.landing_copy}</Section>
      <Section title="Customer interview script" titleColor="text-info">{idea.interview_questions}</Section>
      <Section title="$50 ad test plan" titleColor="text-warning">{idea.ad_test_plan}</Section>
      <Section title="Signals to collect (7 days)" titleColor="text-success">{idea.validation_signals}</Section>

      {!killing ? (
        <div className="flex gap-2 mt-5">
          <button
            onClick={approvePlan}
            disabled={busy}
            className="px-4 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Approve plan
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
              onClick={killValidated}
              className="px-4 py-1.5 text-sm rounded-md bg-text text-bg hover:opacity-90 transition-opacity"
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

function Section({ title, titleColor = "text-muted", children }: { title: string; titleColor?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-5">
      <div className={`font-mono text-[0.6875rem] uppercase tracking-wider ${titleColor} mb-2`}>{title}</div>
      <p className="text-sm leading-relaxed whitespace-pre-line max-w-[65ch]">{children}</p>
    </div>
  );
}
