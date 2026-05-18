"use client";

export type Conflict = {
  run_id: number | null;
  idea_context_id?: number | null;
  idea_title?: string | null;
  started_at: string | null;
};

export function ConflictToast({
  message,
  cancelLabel,
  onCancel,
  onDismiss,
  canCancel,
  cancelling,
}: {
  message: string;
  cancelLabel: string;
  onCancel: () => void;
  onDismiss: () => void;
  canCancel: boolean;
  cancelling: boolean;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md bg-surface border border-warning/40 rounded-md shadow-lg p-4">
      <div className="text-sm mb-3 leading-relaxed">{message}</div>
      <div className="flex gap-2 justify-end">
        {canCancel && (
          <button
            onClick={onCancel}
            disabled={cancelling}
            className="px-3 py-1.5 text-xs rounded-md bg-warning text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {cancelling ? "Cancelling…" : cancelLabel}
          </button>
        )}
        <button
          onClick={onDismiss}
          disabled={cancelling}
          className="px-3 py-1.5 text-xs rounded-md border border-border text-text hover:bg-border/50 disabled:opacity-50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
