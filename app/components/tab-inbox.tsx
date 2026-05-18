"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea } from "@/lib/supabase";
import { Card } from "./card";
import { StatusPill } from "./status-pill";
import { ConflictToast, type Conflict } from "./conflict-toast";

export function TabInbox() {
  const { data, mutate } = useSWR<{ ideas: Idea[] }>("/api/ideas?status=new", fetcher, {
    refreshInterval: 30000,
  });
  const ideas = data?.ideas ?? [];

  if (!data) return <div className="text-sm text-muted">Loading…</div>;
  if (ideas.length === 0)
    return (
      <div className="text-sm text-muted">
        No new ideas yet. The generator runs daily at 8 AM, or click &ldquo;Run now&rdquo; up top.
      </div>
    );

  return (
    <div className="space-y-6 max-w-[720px]">
      {ideas.map((idea) => (
        <InboxCard key={idea.id} idea={idea} onChange={() => mutate()} />
      ))}
    </div>
  );
}

function InboxCard({ idea, onChange }: { idea: Idea; onChange: () => void }) {
  const [killing, setKilling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function pursue() {
    setBusy(true);
    try {
      const r = await fetch("/api/trigger-research", {
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

  async function cancelAndPursue() {
    if (!conflict?.run_id) return;
    setCancelling(true);
    try {
      await fetch("/api/cancel-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: conflict.run_id }),
      });
      setConflict(null);
      await pursue();
    } finally {
      setCancelling(false);
    }
  }

  async function kill() {
    setBusy(true);
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
  const message = `"${conflictTitle}" is already in research. Cancel that to pursue "${idea.title}" instead?`;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <StatusPill status={idea.status} />
        <span className="font-mono text-xs text-muted">{formatDate(idea.created_at)}</span>
      </div>
      <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
      <p className="text-base text-text/90 leading-relaxed mb-4">{idea.description}</p>
      {idea.tags && idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {idea.tags.map((t) => (
            <span
              key={t}
              className="font-mono text-[0.6875rem] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-border text-muted"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="mb-4">
        <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">Why this works</div>
        <p className="text-sm leading-relaxed">{idea.why_it_works}</p>
      </div>
      <div className="mb-5">
        <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">Devil&rsquo;s advocate</div>
        <p className="text-sm leading-relaxed">{idea.devils_advocate}</p>
      </div>

      {!killing ? (
        <div className="flex gap-2">
          <button
            onClick={pursue}
            disabled={busy}
            className="px-4 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Pursue
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
        <div className="flex gap-2 items-center">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why kill? (becomes a dislike pattern)"
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
          />
          <button
            onClick={kill}
            disabled={busy}
            className="px-4 py-1.5 text-sm rounded-md bg-text text-bg hover:opacity-90 transition-opacity"
          >
            Confirm
          </button>
          <button
            onClick={() => setKilling(false)}
            className="text-sm text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
      )}

      {conflict && (
        <ConflictToast
          message={message}
          cancelLabel="Cancel and pursue"
          canCancel={conflict.run_id != null}
          cancelling={cancelling}
          onCancel={cancelAndPursue}
          onDismiss={() => setConflict(null)}
        />
      )}
    </Card>
  );
}
