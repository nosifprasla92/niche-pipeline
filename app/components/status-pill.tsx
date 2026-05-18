import { STATUS_COLOR, STATUS_LABEL } from "@/lib/fetcher";

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        STATUS_COLOR[status] ?? "bg-zinc-200 text-zinc-700"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
