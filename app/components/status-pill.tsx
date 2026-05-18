import { STATUS_COLOR, STATUS_LABEL } from "@/lib/fetcher";

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-sm font-mono text-[0.6875rem] uppercase tracking-wider ${
        STATUS_COLOR[status] ?? "bg-border text-muted"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
