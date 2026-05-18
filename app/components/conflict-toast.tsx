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
    <div className="fixed bottom-4 right-4 z-50 max-w-md bg-white dark:bg-zinc-950 border border-amber-300 dark:border-amber-700 rounded-lg shadow-lg p-4">
      <div className="text-sm mb-3">{message}</div>
      <div className="flex gap-2 justify-end">
        {canCancel && (
          <button
            onClick={onCancel}
            disabled={cancelling}
            className="px-3 py-1 text-xs rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : cancelLabel}
          </button>
        )}
        <button
          onClick={onDismiss}
          disabled={cancelling}
          className="px-3 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
