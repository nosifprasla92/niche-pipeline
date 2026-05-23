import { ReactNode } from "react";
import { InsightPoint } from "@/lib/supabase";

type Tone = "positive" | "cautionary" | "neutral";

const TONE_DASH: Record<Tone, string> = {
  positive: "text-success",
  cautionary: "text-warning",
  neutral: "text-muted",
};

const TONE_MARK: Record<Tone, string> = {
  positive: "bg-success/15 text-success rounded-sm px-0.5",
  cautionary: "bg-warning/15 text-warning rounded-sm px-0.5",
  neutral: "bg-accent/10 text-accent rounded-sm px-0.5",
};

const KEY_TERM_RE =
  /(\$[\d,.]+[kKmMbB]?|\d+(?:\.\d+)?%|\d+(?:\.\d+)?x\b|\d+[kKmMbB]\b|"[^"]+"|"[^"]+"|«[^»]+»)/g;

function highlightTerms(text: string, markClass: string): ReactNode {
  const parts = text.split(KEY_TERM_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    KEY_TERM_RE.test(part) ? (
      <mark key={i} className={markClass}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function InsightList({
  points,
  tone = "neutral",
}: {
  points: InsightPoint[] | null;
  tone?: Tone;
}) {
  if (!points || points.length === 0) return null;
  return (
    <ul className="space-y-2.5 text-sm leading-relaxed list-none">
      {points.map((p, i) => (
        <li
          key={i}
          className={
            p.important
              ? "flex gap-2.5 font-medium text-text"
              : "flex gap-2 text-text/90"
          }
        >
          <span
            className={`shrink-0 select-none ${p.important ? TONE_DASH[tone] : "text-muted"}`}
            aria-hidden
          >
            {p.important ? "●" : "—"}
          </span>
          <span>
            {p.important
              ? highlightTerms(p.text, TONE_MARK[tone])
              : p.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
