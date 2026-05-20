import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/log";
import { checkSpendAllowed } from "@/lib/spend-guard";

export const maxDuration = 300;

const MODEL = "anthropic/claude-haiku-4-5";
const HTML_TEXT_CAP = 80_000;

const Distillation = z.object({
  title: z.string().min(2).max(240),
  source_type: z.enum(["pdf", "article", "report", "other"]),
  summary: z
    .string()
    .min(60)
    .max(1200)
    .describe(
      "2–4 sentences. What this source covers and why its data points are useful as priors for a small-business idea pipeline. No marketing voice.",
    ),
  key_data_points: z
    .array(
      z.object({
        metric: z
          .string()
          .min(3)
          .max(200)
          .describe("e.g. 'iOS subscription app median annual churn'"),
        value: z
          .string()
          .min(1)
          .max(200)
          .describe("The number/fact with units, e.g. '53%' or '$4.99/mo median'"),
        context: z
          .string()
          .max(400)
          .optional()
          .describe("Segment, year, sample size, or other conditions"),
        page_or_quote: z
          .string()
          .max(400)
          .optional()
          .describe("Page reference or short verbatim quote"),
      }),
    )
    .min(5)
    .max(40)
    .describe(
      "Concrete, citable facts. Prefer numbers with units over qualitative claims. Each point should make sense to a routine reading it out-of-context months from now.",
    ),
  tags: z
    .array(z.string().min(2).max(40))
    .min(2)
    .max(12)
    .describe(
      "Lowercase topic tags for filtering. Mix domain ('subscriptions','consumer','b2b'), " +
        "platform ('ios','web'), and topic ('pricing','churn','ltv','conversion'). " +
        "Keep generic enough to match queries from routines that don't know about this source.",
    ),
});

const Body = z.object({
  url: z.string().url(),
  tags: z.array(z.string()).optional(),
});

type Fetched =
  | { type: "pdf"; bytes: Uint8Array }
  | { type: "html"; text: string };

async function fetchSource(url: string): Promise<Fetched> {
  const res = await fetch(url, {
    headers: { "user-agent": "niche-pipeline-ingest/1.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const looksPdf =
    contentType.includes("application/pdf") ||
    url.toLowerCase().split("?")[0].endsWith(".pdf");

  if (looksPdf) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { type: "pdf", bytes };
  }

  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { type: "html", text: text.slice(0, HTML_TEXT_CAP) };
}

const PROMPT = `You are extracting market-signal priors from a research source so a small-business idea pipeline can use them as REFERENCE — not constraints. The pipeline generates and scores business ideas across many niches (not just whatever this source happens to focus on), so distilled points should be portable: useful to a routine that has never read the source.

Distill 10–30 concrete, citable data points. Strongly prefer numbers with units (%, $, days, counts, multiples) over qualitative claims. Skip vendor self-promotion and methodology boilerplate. If the source covers a narrow vertical (e.g. consumer subscription apps), still extract the priors faithfully — tagging will keep them from being misapplied.

Tag wisely: routines query by tags && {…}, so use generic, queryable terms (e.g. 'subscriptions','ios','pricing','churn','ltv','consumer','b2b'). Avoid one-off tags that no other source would ever match.`;

async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // ingest-source isn't tracked in routine_runs, so it opts out of the daily
  // cap (which counts routine_runs rows). The env var + DB kill switch
  // brakes still apply so a global halt covers this path too.
  const guard = await checkSpendAllowed({ countAgainstDailyCap: false });
  if (!guard.ok) {
    logEvent("warn", "ingest-source.spend_guard_blocked", {
      reason: guard.reason,
      detail: guard.detail,
      url: body.url,
    });
    return NextResponse.json(
      { error: `spend_guard:${guard.reason}`, detail: guard.detail },
      { status: 503 },
    );
  }

  logEvent("info", "ingest-source.start", { url: body.url });

  try {
    const source = await fetchSource(body.url);

    const content =
      source.type === "pdf"
        ? [
            { type: "text" as const, text: PROMPT },
            {
              type: "file" as const,
              data: source.bytes,
              mediaType: "application/pdf",
            },
          ]
        : [
            {
              type: "text" as const,
              text: `${PROMPT}\n\nSOURCE URL: ${body.url}\n\nSOURCE TEXT (HTML stripped, possibly truncated):\n${source.text}`,
            },
          ];

    const { object } = await generateObject({
      model: MODEL,
      schema: Distillation,
      messages: [{ role: "user", content }],
    });

    const tagSet = new Set<string>();
    for (const t of [...(body.tags ?? []), ...object.tags]) {
      const norm = t.toLowerCase().trim();
      if (norm) tagSet.add(norm);
    }
    const finalTags = [...tagSet];

    const row = {
      url: body.url,
      title: object.title,
      source_type: object.source_type,
      summary: object.summary,
      key_data_points: object.key_data_points,
      tags: finalTags,
      ingested_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("research_sources")
      .upsert(row, { onConflict: "url" })
      .select("id")
      .single();
    if (error) throw new Error(`upsert: ${error.message}`);

    logEvent("info", "ingest-source.completed", {
      id: data.id,
      url: body.url,
      points: object.key_data_points.length,
      tags: finalTags,
    });

    return NextResponse.json({
      ok: true,
      id: data.id,
      title: object.title,
      source_type: object.source_type,
      summary: object.summary,
      tags: finalTags,
      data_point_count: object.key_data_points.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent("error", "ingest-source.failed", { url: body.url, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export { POST };
