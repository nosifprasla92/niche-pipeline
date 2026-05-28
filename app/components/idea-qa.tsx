"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher, formatDate } from "@/lib/fetcher";
import type { IdeaQuestion } from "@/lib/supabase";

export function IdeaQA({ ideaId }: { ideaId: number }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);

  const { data, mutate } = useSWR<{ questions: IdeaQuestion[] }>(
    open ? `/api/ideas/${ideaId}/questions` : null,
    fetcher,
  );
  // API returns newest first.
  const history = data?.questions ?? [];
  const latest: IdeaQuestion | null = history[0] ?? null;
  const earlier = history.slice(1);
  const busy = pendingQuestion !== null;

  async function submit() {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setPendingQuestion(q);
    setQuestion("");
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
        setQuestion(q);
        return;
      }
      await mutate();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setQuestion(q);
    } finally {
      setPendingQuestion(null);
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
          placeholder={
            latest || busy
              ? "Ask a follow-up…"
              : "Ask anything — challenge an assumption, surface a gap, propose a falsification…"
          }
          rows={2}
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

      {busy && pendingQuestion && (
        <ExchangeBlock question={pendingQuestion} timestamp="just now">
          <div className="animate-pulse font-mono text-xs uppercase tracking-wider text-muted">
            Reasoning… (may take 20–60s with web search)
          </div>
        </ExchangeBlock>
      )}

      {!busy && latest && (
        <ExchangeBlock
          question={latest.question}
          timestamp={formatDate(latest.created_at)}
        >
          <AnswerText text={latest.answer} />
        </ExchangeBlock>
      )}

      {earlier.length > 0 && (
        <div className="mt-6 pt-5 border-t border-border/60">
          {!showEarlier ? (
            <button
              onClick={() => setShowEarlier(true)}
              className="py-2 font-mono text-[0.6875rem] uppercase tracking-wider text-muted hover:text-text transition-colors"
            >
              Earlier in this thread ({earlier.length}) ↓
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowEarlier(false)}
                className="mb-4 py-2 font-mono text-[0.6875rem] uppercase tracking-wider text-muted hover:text-text transition-colors"
              >
                Hide earlier ↑
              </button>
              <div className="space-y-5 opacity-80">
                {earlier.map((q) => (
                  <ExchangeBlock
                    key={q.id}
                    question={q.question}
                    timestamp={formatDate(q.created_at)}
                    muted
                  >
                    <AnswerText text={q.answer} muted />
                  </ExchangeBlock>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ExchangeBlock({
  question,
  timestamp,
  muted = false,
  children,
}: {
  question: string;
  timestamp: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 max-w-[65ch]">
      <div
        className={`font-mono text-[0.6875rem] uppercase tracking-wider mb-1.5 ${
          muted ? "text-muted/70" : "text-muted"
        }`}
      >
        Founder · {timestamp}
      </div>
      <p
        className={`text-sm italic leading-relaxed whitespace-pre-line mb-4 ${
          muted ? "text-text/60" : "text-text/80"
        }`}
      >
        {question}
      </p>
      <div
        className={`border-l-2 pl-4 ${
          muted ? "border-border" : "border-accent/30"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function AnswerText({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <div
      className={`text-[0.9375rem] leading-[1.65] space-y-3 ${
        muted ? "text-text/60" : "text-text"
      }`}
    >
      {renderMarkdown(text)}
    </div>
  );
}

// Minimal markdown renderer tuned to what Sonnet actually emits in this Q&A
// flow: paragraphs separated by blank lines, **bold**, *italic*, `code`,
// [text](url), bare https URLs, and "- "/"* "/"1. " list items. No
// react-markdown dep — keeps the bundle small and the rendering predictable
// for an editorial UI.

function renderMarkdown(text: string): React.ReactNode {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, i) => renderBlock(block, i));
}

function renderBlock(block: string, key: number): React.ReactNode {
  const trimmed = block.trim();
  if (!trimmed) return null;

  const lines = trimmed.split("\n");
  const isBullet = lines.every((l) => /^\s*[-*]\s+/.test(l));
  const isNumbered = lines.every((l) => /^\s*\d+\.\s+/.test(l));

  if (isBullet) {
    return (
      <ul key={key} className="list-disc pl-5 space-y-1.5 marker:text-muted">
        {lines.map((l, j) => (
          <li key={j}>{renderInline(l.replace(/^\s*[-*]\s+/, ""))}</li>
        ))}
      </ul>
    );
  }
  if (isNumbered) {
    return (
      <ol key={key} className="list-decimal pl-5 space-y-1.5 marker:text-muted">
        {lines.map((l, j) => (
          <li key={j}>{renderInline(l.replace(/^\s*\d+\.\s+/, ""))}</li>
        ))}
      </ol>
    );
  }
  return (
    <p key={key} className="whitespace-pre-line">
      {renderInline(trimmed)}
    </p>
  );
}

// Token-stream inline renderer. Order matters: peel off the longest-match
// token at each position so e.g. `**foo**` isn't mistaken for two single-*
// italics. URLs come last because **/* never wrap raw URLs in practice.
function renderInline(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let buf = "";
  let i = 0;
  let key = 0;

  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };

  while (i < text.length) {
    // **bold**
    if (text[i] === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        out.push(
          <strong key={key++} className="font-semibold">
            {renderInline(text.slice(i + 2, end))}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    // *italic*  (single asterisk, not part of ** — and not surrounding empty)
    if (text[i] === "*" && text[i + 1] !== "*" && text[i + 1] !== " ") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1 && text[end - 1] !== " ") {
        flush();
        out.push(
          <em key={key++} className="italic">
            {renderInline(text.slice(i + 1, end))}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }
    // `code`
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push(
          <code
            key={key++}
            className="font-mono text-[0.85em] px-1 py-0.5 rounded bg-border/40"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }
    // [text](url)
    if (text[i] === "[") {
      const closeBracket = text.indexOf("]", i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const label = text.slice(i + 1, closeBracket);
          const url = text.slice(closeBracket + 2, closeParen);
          flush();
          out.push(
            <a
              key={key++}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-accent/40 hover:decoration-accent"
            >
              {renderInline(label)}
            </a>,
          );
          i = closeParen + 1;
          continue;
        }
      }
    }
    // bare https URL
    if (text[i] === "h" && text.slice(i, i + 4).toLowerCase() === "http") {
      const match = text.slice(i).match(/^https?:\/\/[^\s)<>\]]+/);
      if (match) {
        flush();
        const url = match[0];
        out.push(
          <a
            key={key++}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-accent/40 hover:decoration-accent"
          >
            {url}
          </a>,
        );
        i += url.length;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return out;
}
