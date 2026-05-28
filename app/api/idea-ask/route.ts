import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase, type Idea, type IdeaQuestion } from "@/lib/supabase";
import { logEvent } from "@/lib/log";
import { checkSpendAllowed } from "@/lib/spend-guard";
import { generateText } from "@/worker/claude";

export const maxDuration = 300;

// Uses Claude Max via the agent SDK (worker/claude.ts) — same OAuth path the
// daily routines use. Bills the Max plan, not the paid AI Gateway.
const MODEL = "sonnet";
const THINKING_BUDGET_TOKENS = 4000;
const PER_IDEA_DAILY_CAP = 5;
// How many prior turns (each = one Q + one A) to include as context on a
// follow-up. Keeps the dialogue coherent without unbounded prompt growth.
const PRIOR_TURNS_LIMIT = 6;
const PRIOR_ANSWER_CHARS = 1200;

const Body = z.object({
  idea_id: z.number().int().positive(),
  question: z.string().min(3).max(2000),
});

const SYSTEM = `You are the founder's reasoning partner on a single-user small-business idea pipeline. You are in an ongoing back-and-forth with the founder about ONE specific idea. Earlier turns of the dialogue are included for context.

RESPONSE SHAPE — these are hard rules:
- Maximum 1000 characters total (roughly 150 words, 1–2 paragraphs).
- Lead with the answer in the first sentence. No "Great question", no "Let me know if…", no preamble or sign-off.
- Back up your reasoning. Either (a) cite the idea's own context fields explicitly ("per your competitor complaints, …"), or (b) cite a source you fetched with WebSearch — paste the URL inline in brackets, e.g. [https://example.com/path]. Do not invent URLs.
- If a question genuinely needs more space (e.g. multi-step plan), break it into the smallest set of named bullets — but the ceiling still holds.
- If the context is thin on what the question needs, say so in one sentence and propose what you'd want to know.

You have WebSearch available. Use it when the question hinges on a fact you don't have in the idea context — market size, churn benchmarks, competitor pricing, regulatory specifics — but skip it for questions that are pure reasoning over the context already in front of you. Speed matters; this is interactive.`;

function formatIdeaContext(idea: Idea): string {
  const lines: string[] = [];
  lines.push(`IDEA #${idea.id} — ${idea.title}`);
  lines.push(`Status: ${idea.status}`);
  if (idea.income_bracket) lines.push(`Income bracket: ${idea.income_bracket}`);
  if (idea.tags?.length) lines.push(`Tags: ${idea.tags.join(", ")}`);
  lines.push("");
  lines.push(`DESCRIPTION:\n${idea.description}`);

  if (idea.why_it_works?.length) {
    lines.push("\nWHY IT WORKS:");
    for (const p of idea.why_it_works) {
      lines.push(`- ${p.text}${p.important ? " [important]" : ""}`);
    }
  }
  if (idea.devils_advocate?.length) {
    lines.push("\nDEVIL'S ADVOCATE:");
    for (const p of idea.devils_advocate) {
      lines.push(`- ${p.text}${p.important ? " [important]" : ""}`);
    }
  }

  const research: Array<[string, string | number | null]> = [
    ["Competitors >$50", idea.competitors_above_50],
    ["Effort (weeks)", idea.effort_weeks],
    ["Competition analysis", idea.competition_analysis],
    ["Competitor complaints", idea.competitor_complaints],
    ["Effort breakdown", idea.effort_breakdown],
    ["Zero-paid path", idea.zero_paid_path],
  ];
  const researchLines = research.filter(([, v]) => v != null && v !== "");
  if (researchLines.length) {
    lines.push("\nRESEARCH:");
    for (const [k, v] of researchLines) lines.push(`${k}: ${v}`);
  }

  const validation: Array<[string, string | null]> = [
    ["Landing copy", idea.landing_copy],
    ["Interview questions", idea.interview_questions],
    ["Ad test plan", idea.ad_test_plan],
    ["Validation signals", idea.validation_signals],
  ];
  const validationLines = validation.filter(([, v]) => v != null && v !== "");
  if (validationLines.length) {
    lines.push("\nVALIDATION:");
    for (const [k, v] of validationLines) lines.push(`${k}: ${v}`);
  }

  if (idea.business_plan) {
    lines.push("\nBUSINESS PLAN:");
    lines.push(JSON.stringify(idea.business_plan, null, 2));
  }
  if (idea.first_actions?.length) {
    lines.push("\nFIRST ACTIONS:");
    for (const a of idea.first_actions) lines.push(`- ${a}`);
  }
  if (idea.user_notes) lines.push(`\nFOUNDER NOTES:\n${idea.user_notes}`);

  return lines.join("\n");
}

function formatPriorTurns(prior: IdeaQuestion[]): string {
  if (prior.length === 0) return "(no prior turns — this is the opening question)";
  const turns = prior.slice(-PRIOR_TURNS_LIMIT);
  const lines: string[] = [];
  for (const t of turns) {
    const a =
      t.answer.length > PRIOR_ANSWER_CHARS
        ? `${t.answer.slice(0, PRIOR_ANSWER_CHARS)}…`
        : t.answer;
    lines.push(`Founder: ${t.question}`);
    lines.push(`You: ${a}`);
  }
  return lines.join("\n");
}

function buildPrompt(
  idea: Idea,
  prior: IdeaQuestion[],
  question: string,
): string {
  return [
    formatIdeaContext(idea),
    "",
    "PRIOR CONVERSATION (founder ↔ you, in order):",
    formatPriorTurns(prior),
    "",
    `NEW QUESTION FROM FOUNDER: ${question}`,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const { idea_id, question } = body;

  // Global env + kill_switch brakes apply; daily routine_runs cap does not
  // (Q&A is interactive, not a routine; matches ingest-source rationale).
  const guard = await checkSpendAllowed({ countAgainstDailyCap: false });
  if (!guard.ok) {
    logEvent("warn", "idea_ask.spend_guard_blocked", {
      reason: guard.reason,
      detail: guard.detail,
      idea_id,
    });
    return NextResponse.json(
      { error: `spend_guard:${guard.reason}`, detail: guard.detail },
      { status: 503 },
    );
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: todayCount, error: capError } = await supabase
    .from("idea_questions")
    .select("id", { count: "exact", head: true })
    .eq("idea_id", idea_id)
    .gte("created_at", startOfDay.toISOString());
  if (capError) {
    return NextResponse.json({ error: capError.message }, { status: 500 });
  }
  if ((todayCount ?? 0) >= PER_IDEA_DAILY_CAP) {
    logEvent("warn", "idea_ask.per_idea_cap_hit", {
      idea_id,
      count: todayCount,
      cap: PER_IDEA_DAILY_CAP,
    });
    return NextResponse.json(
      {
        error: "per_idea_daily_cap",
        detail: `today's questions on this idea: ${todayCount}/${PER_IDEA_DAILY_CAP}`,
      },
      { status: 429 },
    );
  }

  const [{ data: ideaRow, error: ideaError }, { data: priorRows, error: priorError }] =
    await Promise.all([
      supabase.from("ideas").select("*").eq("id", idea_id).maybeSingle(),
      supabase
        .from("idea_questions")
        .select("id, idea_id, question, answer, model, thinking_tokens, input_tokens, output_tokens, created_at")
        .eq("idea_id", idea_id)
        .order("created_at", { ascending: true }),
    ]);
  if (ideaError) {
    return NextResponse.json({ error: ideaError.message }, { status: 500 });
  }
  if (!ideaRow) {
    return NextResponse.json({ error: "idea not found" }, { status: 404 });
  }
  if (priorError) {
    return NextResponse.json({ error: priorError.message }, { status: 500 });
  }
  const idea = ideaRow as Idea;
  const prior = (priorRows ?? []) as IdeaQuestion[];

  const prompt = buildPrompt(idea, prior, question);
  logEvent("info", "idea_ask.start", {
    idea_id,
    prior_turns: prior.length,
    question_chars: question.length,
    context_chars: prompt.length,
  });

  let answer: string;
  let cost;
  try {
    const out = await generateText({
      prompt,
      systemPrompt: SYSTEM,
      model: MODEL,
      thinking: { type: "enabled", budgetTokens: THINKING_BUDGET_TOKENS },
      allowedTools: ["WebSearch"],
      maxTurns: 5,
    });
    answer = out.value.trim();
    cost = out.cost;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent("error", "idea_ask.generate_failed", { idea_id, message });
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!answer) {
    logEvent("error", "idea_ask.empty_answer", { idea_id });
    return NextResponse.json({ error: "empty answer" }, { status: 502 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("idea_questions")
    .insert({
      idea_id,
      question,
      answer,
      model: MODEL,
      thinking_tokens: null,
      input_tokens: cost.input_tokens,
      output_tokens: cost.output_tokens,
    })
    .select("id, created_at")
    .single();
  if (insertError) {
    logEvent("error", "idea_ask.persist_failed", {
      idea_id,
      message: insertError.message,
    });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  logEvent("info", "idea_ask.completed", {
    idea_id,
    answer_chars: answer.length,
    input_tokens: cost.input_tokens,
    output_tokens: cost.output_tokens,
    cost_usd: cost.cost_usd,
  });

  return NextResponse.json({
    id: inserted.id,
    answer,
    created_at: inserted.created_at,
  });
}
