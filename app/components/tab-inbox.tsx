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

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (ideas.length === 0)
    return (
      <div className="text-sm text-zinc-500">
        No new ideas yet. The generator runs daily at 8 AM, or click "Run now" up top.
      </div>
    );

  return (
    <div className="space-y-4">
      {ideas.map((idea) => (
        <InboxCard key={idea.id} idea={idea} onChange={() => mutate()} />
      ))}
    </div>
  );
}

function InboxCard({ idea, onChange }: { idea: Idea; onChange: () => void }) {
  const [passing, setPassing] = useState(false);
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

  async function pass() {
    setBusy(true);
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
  const message = `"${conflictTitle}" is already in research. Cancel that to pursue "${idea.title}" instead?`;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <StatusPill status={idea.status} />
        <span className="text-xs text-zinc-500">{formatDate(idea.created_at)}</span>
      </div>
      <h3 className="text-lg font-semibold mb-1">{idea.title}</h3>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">{idea.description}</p>
      {idea.tags && idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {idea.tags.map((t) => (
            <span
              key={t}
              className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="mb-3">
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Why this works</div>
        <p className="text-sm">{idea.why_it_works}</p>
      </div>
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Devil's advocate</div>
        <p className="text-sm">{idea.devils_advocate}</p>
      </div>

      {!passing ? (
        <div className="flex gap-2">
          <button
            onClick={pursue}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Pursue
          </button>
          <button
            onClick={() => setPassing(true)}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Pass
          </button>
        </div>
      ) : (
        <div className="flex gap-2 items-center">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why pass? (becomes a dislike pattern)"
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
          />
          <button
            onClick={pass}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          >
            Confirm
          </button>
          <button
            onClick={() => setPassing(false)}
            className="text-sm text-zinc-500"
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
