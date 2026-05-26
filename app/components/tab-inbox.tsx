"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea } from "@/lib/supabase";
import { Card } from "./card";
import { StatusPill } from "./status-pill";
import { ConflictToast, type Conflict } from "./conflict-toast";
import { InsightList } from "./insight-list";
import { useIsMobile } from "@/lib/use-mobile";

const TEST_PREFIX = "(test) ";
type InboxView = "ideas" | "testing";

function isTest(idea: Idea): boolean {
  return idea.title.startsWith(TEST_PREFIX);
}

export function TabInbox() {
  const { data, mutate } = useSWR<{ ideas: Idea[] }>("/api/ideas?status=new", fetcher, {
    refreshInterval: 30000,
  });
  const [view, setView] = useState<InboxView>("ideas");
  const ideas = data?.ideas ?? [];

  if (!data) return <div className="text-sm text-muted">Loading…</div>;

  const realIdeas = ideas.filter((i) => !isTest(i));
  const testIdeas = ideas.filter(isTest);
  const visible = view === "ideas" ? realIdeas : testIdeas;

  return (
    <div className="max-w-[720px]">
      <div className="flex gap-1 mb-5 border-b border-border">
        <SubTab
          label="Ideas"
          count={realIdeas.length}
          active={view === "ideas"}
          onClick={() => setView("ideas")}
        />
        <SubTab
          label="Testing"
          count={testIdeas.length}
          active={view === "testing"}
          onClick={() => setView("testing")}
        />
      </div>

      {visible.length === 0 ? (
        <div className="text-sm text-muted">
          {view === "ideas"
            ? "No new ideas yet. The generator runs daily at 8 AM, or click “Run now” up top."
            : "No test ideas. Items get marked as test when their title starts with “(test)”."}
        </div>
      ) : (
        <div className="space-y-6">
          {visible.map((idea) => (
            <InboxCard key={idea.id} idea={idea} onChange={() => mutate()} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-3 sm:py-2 text-sm transition-colors ${
        active ? "text-text" : "text-muted hover:text-text"
      }`}
    >
      <span className="flex items-center gap-2">
        {label}
        {count > 0 && (
          <span
            className={`font-mono text-[0.6875rem] tabular-nums px-1.5 py-0.5 rounded-sm ${
              active ? "bg-accent/15 text-accent" : "bg-border text-muted"
            }`}
          >
            {count}
          </span>
        )}
      </span>
      {active && (
        <span className="absolute left-0 right-0 -bottom-px h-px bg-accent" />
      )}
    </button>
  );
}

function InboxCard({ idea, onChange }: { idea: Idea; onChange: () => void }) {
  const [killing, setKilling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();

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
      <p className="text-base text-text/90 leading-relaxed mb-4 whitespace-pre-line max-w-[65ch]">{idea.description}</p>
      {idea.tags && idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {idea.tags.map((t) => (
            <span
              key={t}
              className="font-mono text-[0.6875rem] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-accent/8 text-accent/80"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {isMobile && !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="mb-5 py-2 font-mono text-xs uppercase tracking-wider text-muted hover:text-text transition-colors"
        >
          Show analysis ↓
        </button>
      ) : (
        <>
          <div className="mb-5">
            <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-success mb-2">Why this works</div>
            <InsightList points={idea.why_it_works} tone="positive" />
          </div>
          <div className="mb-6">
            <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-warning mb-2">Devil&rsquo;s advocate</div>
            <InsightList points={idea.devils_advocate} tone="cautionary" />
          </div>
          {isMobile && (
            <button
              onClick={() => setExpanded(false)}
              className="mb-5 py-2 font-mono text-xs uppercase tracking-wider text-muted hover:text-text transition-colors"
            >
              Hide analysis ↑
            </button>
          )}
        </>
      )}

      {!killing ? (
        <div className="flex gap-2">
          <button
            onClick={pursue}
            disabled={busy}
            className="px-5 py-2.5 sm:px-4 sm:py-2 text-sm rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Pursue
          </button>
          <button
            onClick={() => setKilling(true)}
            disabled={busy}
            className="px-5 py-2.5 sm:px-4 sm:py-2 text-sm rounded-md border border-border text-error hover:bg-border/50 transition-colors"
          >
            Kill
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why kill? (becomes a dislike pattern)"
            className="w-full sm:flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2 items-center">
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
