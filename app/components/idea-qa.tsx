"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher, formatDate } from "@/lib/fetcher";
import type { IdeaQuestion } from "@/lib/supabase";

const COLLAPSED_HISTORY_THRESHOLD = 2;

export function IdeaQA({ ideaId }: { ideaId: number }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const { data, mutate } = useSWR<{ questions: IdeaQuestion[] }>(
    open ? `/api/ideas/${ideaId}/questions` : null,
    fetcher,
  );
  const history = data?.questions ?? [];
  const visibleHistory = showAllHistory
    ? history
    : history.slice(0, COLLAPSED_HISTORY_THRESHOLD);
  const hiddenCount = history.length - visibleHistory.length;

  async function submit() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/idea-ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea_id: ideaId, question: q }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; detail?: string; answer?: string }
        | null;
      if (!res.ok) {
        if (res.status === 429) {
          setError(body?.detail ?? "Daily question limit reached for this idea.");
        } else if (res.status === 503) {
          setError("AI is paused — check the kill switch.");
        } else {
          setError(body?.error ?? `Request failed (${res.status})`);
        }
        return;
      }
      setQuestion("");
      await mutate();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 py-2 font-mono text-[0.6875rem] uppercase tracking-wider text-muted hover:text-text transition-colors"
      >
        Ask a question →
      </button>
    );
  }

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-3">
        Reasoning partner
      </div>

      <div className="flex flex-col gap-2 max-w-[65ch]">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask anything — challenge an assumption, surface a gap, propose a falsification…"
          rows={3}
          disabled={busy}
          className="w-full text-sm px-3 py-2 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent disabled:opacity-50"
        />
        <div className="flex gap-2 items-center">
          <button
            onClick={submit}
            disabled={busy || question.trim().length < 3}
            className="px-4 py-1.5 text-sm rounded-md bg-text text-bg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {busy ? "Thinking…" : "Ask"}
          </button>
          <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted">
            ⌘+Enter
          </span>
        </div>
      </div>

      {error && (
        <div className="mt-3 text-sm text-error max-w-[65ch]">{error}</div>
      )}

      {busy && (
        <div className="mt-5 animate-pulse font-mono text-xs uppercase tracking-wider text-muted">
          Reasoning… (Claude Max — typically 20–60 seconds)
        </div>
      )}

      {visibleHistory.length > 0 && (
        <div className="mt-6 space-y-5">
          {visibleHistory.map((q) => (
            <QAPair key={q.id} q={q} />
          ))}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAllHistory(true)}
              className="py-2 font-mono text-[0.6875rem] uppercase tracking-wider text-muted hover:text-text transition-colors"
            >
              Show {hiddenCount} earlier question{hiddenCount === 1 ? "" : "s"} ↓
            </button>
          )}
          {showAllHistory && history.length > COLLAPSED_HISTORY_THRESHOLD && (
            <button
              onClick={() => setShowAllHistory(false)}
              className="py-2 font-mono text-[0.6875rem] uppercase tracking-wider text-muted hover:text-text transition-colors"
            >
              Hide earlier questions ↑
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QAPair({ q }: { q: IdeaQuestion }) {
  return (
    <div className="max-w-[65ch]">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted">
          {formatDate(q.created_at)}
        </span>
      </div>
      <p className="text-sm font-medium mb-2 whitespace-pre-line">
        {q.question}
      </p>
      <p className="text-sm leading-relaxed text-text/90 whitespace-pre-line">
        {q.answer}
      </p>
    </div>
  );
}
