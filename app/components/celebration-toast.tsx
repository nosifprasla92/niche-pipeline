"use client";

import { useEffect, useState } from "react";

const UNDO_WINDOW_MS = 5000;

export function CelebrationToast({
  ideaTitle,
  onUndo,
  onDismiss,
}: {
  ideaTitle: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const [remaining, setRemaining] = useState(UNDO_WINDOW_MS);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const left = Math.max(0, UNDO_WINDOW_MS - (Date.now() - start));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(tick);
        onDismiss();
      }
    }, 100);
    return () => clearInterval(tick);
  }, [onDismiss]);

  const secondsLeft = Math.ceil(remaining / 1000);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md bg-surface border border-border rounded-md shadow-lg p-5">
      <div className="font-display text-xl leading-tight mb-1">
        You launched! <span aria-hidden="true">🎉</span>
      </div>
      <div className="text-sm text-muted leading-relaxed mb-3">
        {ideaTitle}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-muted">
          {secondsLeft > 0 ? `Undo in ${secondsLeft}s` : "Dismissing…"}
        </span>
        <button
          onClick={async () => {
            if (undoing) return;
            setUndoing(true);
            await onUndo();
          }}
          disabled={undoing || remaining <= 0}
          className="px-3 py-1.5 text-xs rounded-md border border-border text-text hover:bg-border/60 disabled:opacity-50 transition-colors"
        >
          {undoing ? "Undoing…" : "Undo"}
        </button>
      </div>
    </div>
  );
}
