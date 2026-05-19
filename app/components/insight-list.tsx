import { InsightPoint } from "@/lib/supabase";

export function InsightList({ points }: { points: InsightPoint[] | null }) {
  if (!points || points.length === 0) return null;
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed list-none">
      {points.map((p, i) => (
        <li
          key={i}
          className={`flex gap-2 ${
            p.important ? "font-medium italic text-text" : "text-text/90"
          }`}
        >
          <span className="text-muted shrink-0 select-none" aria-hidden>
            —
          </span>
          <span>{p.text}</span>
        </li>
      ))}
    </ul>
  );
}
