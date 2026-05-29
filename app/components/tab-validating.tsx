"use client";
import useSWR from "swr";
import { useState } from "react";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea, type IdeaQuestion } from "@/lib/supabase";
import { Card } from "./card";
import { StatusPill } from "./status-pill";
import { ConflictToast, type Conflict } from "./conflict-toast";
import { IdeaQA } from "./idea-qa";

export function TabValidating() {
  const { data, mutate } = useSWR<{ ideas: Idea[] }>(
    "/api/ideas?status=validating,validated",
    fetcher,
    { refreshInterval: 30000 },
  );
  const ideas = data?.ideas ?? [];

  if (!data) return <div className="text-sm text-muted">Loading…</div>;
  if (ideas.length === 0)
    return (
      <div className="text-sm text-muted">
        Nothing in validation right now.
      </div>
    );

  return (
    <div className="space-y-6 max-w-[720px]">
      {ideas.map((idea) => (
        <ValidateCard key={idea.id} idea={idea} onChange={() => mutate()} />
      ))}
    </div>
  );
}

function ValidateCard({ idea, onChange }: { idea: Idea; onChange: () => void }) {
  const [killing, setKilling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function killValidating() {
    await fetch("/api/cancel-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea_id: idea.id }),
    });
    await fetch("/api/update-idea", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: idea.id,
        patch: {
          status: "killed",
          kill_reason: reason || "cancelled during validation",
          killed_at: new Date().toISOString(),
        },
        feedback: reason ? { pattern_type: "dislike", pattern: reason } : undefined,
      }),
    });
    onChange();
  }

  if (idea.status === "validating") {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <StatusPill status={idea.status} />
          <span className="font-mono text-xs text-muted">{formatDate(idea.updated_at)}</span>
        </div>
        <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
        <p className="text-base text-text/90 leading-relaxed mb-5 whitespace-pre-line max-w-[65ch]">{idea.description}</p>
        <div className="animate-pulse font-mono text-xs uppercase tracking-wider text-muted mb-5">
          Building validation kit… typically 2–4 minutes.
        </div>
        {!killing ? (
          <button
            onClick={() => setKilling(true)}
            className="px-4 py-2 text-sm rounded-md border border-border text-error hover:bg-border/50 transition-colors"
          >
            Kill
          </button>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional — becomes a dislike pattern)"
              className="w-full sm:flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2 items-center">
              <button
                onClick={killValidating}
                className="px-4 py-2 text-sm rounded-md bg-text text-bg hover:opacity-90 transition-opacity"
              >
                Confirm
              </button>
              <button onClick={() => setKilling(false)} className="text-sm text-muted hover:text-text">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  async function approvePlan() {
    setBusy(true);
    try {
      const r = await fetch("/api/trigger-plan", {
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

  async function cancelAndPlan() {
    if (!conflict?.run_id) return;
    setCancelling(true);
    try {
      await fetch("/api/cancel-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: conflict.run_id }),
      });
      setConflict(null);
      await approvePlan();
    } finally {
      setCancelling(false);
    }
  }

  async function killValidated() {
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
  const message = `"${conflictTitle}" is already being planned. Cancel that to plan "${idea.title}" instead?`;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <StatusPill status={idea.status} />
        <span className="font-mono text-xs text-muted">
          {idea.validated_at && formatDate(idea.validated_at)}
        </span>
      </div>
      <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
      <p className="text-base text-text/90 leading-relaxed mb-5 whitespace-pre-line max-w-[65ch]">{idea.description}</p>

      {idea.validation_recap && (
        <div className="mb-6 p-4 rounded-md border border-border bg-border/20">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-accent mb-3">
            Recap before you plan
          </div>
          <RecapBeats recap={idea.validation_recap} />
        </div>
      )}

      {idea.decision_rubric && (
        <div className="mb-6">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-2">
            Day-7 decision rubric
          </div>
          <FormattedBody text={idea.decision_rubric} />
        </div>
      )}

      <div className="mb-6">
        <IdeaQA ideaId={idea.id} />
      </div>

      <Band title="The validation kit" defaultOpen>
        <Section title="Open questions this test must resolve">{idea.open_questions}</Section>
        <Section title="Pricing anchor">{idea.pricing_anchor}</Section>
        <Section title="Landing page copy">{idea.landing_copy}</Section>
        <Section title="Customer interview script">{idea.interview_questions}</Section>
        <Section title="Where to find 5 prospects this week">{idea.distribution_beachhead}</Section>
        <Section title="$50 ad test plan">{idea.ad_test_plan}</Section>
        <Section title="Signals to collect (7 days)">{idea.validation_signals}</Section>
      </Band>

      <ContextBlock idea={idea} />

      <StickyActions
        idea={idea}
        busy={busy}
        killing={killing}
        reason={reason}
        setReason={setReason}
        setKilling={setKilling}
        approvePlan={approvePlan}
        killValidated={killValidated}
      />

      {conflict && (
        <ConflictToast
          message={message}
          cancelLabel="Cancel and plan"
          canCancel={conflict.run_id != null}
          cancelling={cancelling}
          onCancel={cancelAndPlan}
          onDismiss={() => setConflict(null)}
        />
      )}
    </Card>
  );
}

function StickyActions({
  idea: _idea,
  busy,
  killing,
  reason,
  setReason,
  setKilling,
  approvePlan,
  killValidated,
}: {
  idea: Idea;
  busy: boolean;
  killing: boolean;
  reason: string;
  setReason: (v: string) => void;
  setKilling: (v: boolean) => void;
  approvePlan: () => void;
  killValidated: () => void;
}) {
  return (
    <div className="sticky bottom-3 sm:bottom-4 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 pt-3 pb-1 mt-6 bg-surface/95 backdrop-blur-sm border-t border-border">
      {!killing ? (
        <div className="flex gap-2 items-center">
          <button
            onClick={approvePlan}
            disabled={busy}
            className="px-5 py-2.5 text-sm rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Approve plan
          </button>
          <button
            onClick={() => setKilling(true)}
            disabled={busy}
            className="px-4 py-2.5 text-sm rounded-md border border-border text-error hover:bg-border/50 transition-colors"
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
            placeholder="Reason (becomes a dislike pattern)"
            className="w-full sm:flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2 items-center">
            <button
              onClick={killValidated}
              className="px-4 py-2 text-sm rounded-md bg-text text-bg hover:opacity-90 transition-opacity"
            >
              Confirm
            </button>
            <button onClick={() => setKilling(false)} className="text-sm text-muted hover:text-text">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-5 last:mb-0">
      <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-2">{title}</div>
      {typeof children === "string" ? (
        <FormattedBody text={children} />
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-line max-w-[65ch]">{children}</p>
      )}
    </div>
  );
}

function Band({
  title,
  children,
  defaultOpen = false,
  rightSlot,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  rightSlot?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-6 border border-border rounded-md">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-border/30 transition-colors"
        aria-expanded={open}
      >
        <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted">
          {title}
        </span>
        <span className="flex items-center gap-3">
          {rightSlot}
          <span className="font-mono text-xs text-muted">{open ? "↑" : "↓"}</span>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border">{children}</div>
      )}
    </div>
  );
}

function ContextBlock({ idea }: { idea: Idea }) {
  // Eagerly fetch the Q&A count so the band label can show it without an open click (F-09).
  const { data } = useSWR<{ questions: IdeaQuestion[] }>(
    `/api/ideas/${idea.id}/questions`,
    fetcher,
  );
  const qaCount = data?.questions.length ?? null;

  const facts: string[] = [];
  if (idea.competitors_above_50 != null)
    facts.push(`${idea.competitors_above_50} competitors >$50`);
  if (idea.effort_weeks != null) facts.push(`${idea.effort_weeks}-week effort`);
  if (idea.income_bracket) facts.push(`${idea.income_bracket} bracket`);
  if (idea.tags?.length) facts.push(`tags: ${idea.tags.slice(0, 4).join(", ")}`);

  const qaLabel =
    qaCount == null ? null : qaCount === 0 ? "no Q&A" : `${qaCount} Q&A turn${qaCount === 1 ? "" : "s"}`;

  return (
    <Band
      title={`Context this kit was built from${qaLabel ? ` · ${qaLabel}` : ""}`}
    >
      <div className="space-y-4">
        {facts.length > 0 && (
          <div className="font-mono text-xs text-muted">{facts.join(" · ")}</div>
        )}
        <Section title="Competitive landscape">{idea.competition_analysis}</Section>
        <Section title="Competitor complaints">{idea.competitor_complaints}</Section>
        <Section title="Effort breakdown">{idea.effort_breakdown}</Section>
        <Section title="Zero-paid path">{idea.zero_paid_path}</Section>
        <div>
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-2">
            Founder Q&amp;A on this idea
          </div>
          <p className="text-sm leading-relaxed max-w-[65ch]">
            {qaCount == null
              ? "Loading…"
              : qaCount === 0
                ? "No questions asked yet — use the panel above to start a thread."
                : `${qaCount} turn${qaCount === 1 ? "" : "s"} above. Answers may contain inline source URLs from web search.`}
          </p>
        </div>
      </div>
    </Band>
  );
}

/**
 * RecapBeats: splits the validation_recap paragraph into 3 named beats
 * (Wedge / What this test resolves / Realistic outcome) using sentence-position
 * heuristics. Falls back to flat rendering if the heuristic doesn't find a clean
 * 3-way split, so the component is safe across drift in model output style.
 */
function RecapBeats({ recap }: { recap: string }) {
  const trimmed = recap.trim();
  const sentences = splitSentences(trimmed);

  // Need at least 3 sentences for a sensible 3-beat split; otherwise render flat.
  if (sentences.length < 3) {
    return (
      <p className="text-base leading-relaxed whitespace-pre-line max-w-[65ch]">
        {trimmed}
      </p>
    );
  }

  const wedge = sentences[0];
  const outcome = sentences[sentences.length - 1];
  const middle = sentences.slice(1, -1).join(" ");

  return (
    <div className="space-y-3 max-w-[65ch]">
      <Beat label="Wedge">{wedge}</Beat>
      <Beat label="What this test resolves">{middle}</Beat>
      <Beat label="Realistic outcome">{outcome}</Beat>
    </div>
  );
}

function Beat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[0.625rem] uppercase tracking-wider text-muted mb-1">
        {label}
      </div>
      <p className="text-base leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * splitSentences: naive sentence splitter that respects common abbreviations
 * (e.g., "$49–199", "U.S.") so currency ranges and initialisms don't fragment
 * the prose. Good enough for the model's editorial output, intentionally not
 * a full NLP pipeline.
 */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (ch === "." || ch === "!" || ch === "?") {
      const next = text[i + 1];
      const prev = text[i - 1];
      // Skip splits inside decimals or single-letter initialisms like "U.S."
      if (next === undefined) {
        out.push(buf.trim());
        buf = "";
      } else if (next === " " && prev && /[a-zA-Z0-9)"'\]]/.test(prev)) {
        // Avoid splitting on "e.g." / "i.e." / "Mr." style: previous char is letter, but next-letter check is hard.
        // Heuristic: split unless the previous 4 chars look like a known abbrev.
        const tail = buf.slice(-5).toLowerCase();
        if (/(^| )(e\.g|i\.e|mr|mrs|ms|dr|jr|sr|vs|etc)\.$/.test(tail)) {
          // skip
        } else {
          out.push(buf.trim());
          buf = "";
        }
      }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * FormattedBody: renders the model's plain-text artifacts with light structure —
 * "- " becomes a bullet, "1. " becomes a numbered item, and "Label: rest" lines
 * get a bold label. Falls through to a plain paragraph otherwise. Stops the
 * "wall of prose" effect without requiring schema changes upstream.
 */
function FormattedBody({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="text-sm leading-relaxed max-w-[65ch] space-y-3">
      {blocks.map((block, i) => {
        if (block.kind === "ul") {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "ol") {
          return (
            <ol key={i} className="list-decimal pl-5 space-y-1">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    // Collect contiguous non-list, non-blank lines into a paragraph block.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\s*-\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "p", text: paraLines.join("\n") });
  }
  return blocks;
}

/**
 * renderInline: bolds the "Label:" prefix when a line starts with a short
 * (1–6 word) label followed by a colon, so the model's "Headline: ...",
 * "Go pattern: ...", "Best channel: ..." surfaces become scan-able without
 * touching the model output. Conservative regex — only matches at the very
 * start of the chunk and only for short labels.
 */
function renderInline(text: string): React.ReactNode {
  const match = text.match(/^([A-Z][A-Za-z0-9 \-/$]{1,40}):\s+([\s\S]*)$/);
  if (!match) return text;
  const [, label, rest] = match;
  // Reject labels that contain too many words (likely a sentence, not a label).
  if (label.trim().split(/\s+/).length > 6) return text;
  return (
    <>
      <span className="font-medium text-text">{label}:</span> {rest}
    </>
  );
}
