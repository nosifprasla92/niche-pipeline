import { z } from "zod";
import {
  supabase,
  type FeedbackPattern,
  type HandlerResult,
  type IncomeBracket,
  type RoutineRun,
} from "../../lib/supabase";
import { generateStructured } from "../claude";

const InsightPointSchema = z.object({
  text: z.string().min(3).max(280),
  important: z.boolean().optional(),
});

const GeneratedIdeaSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(40).max(800),
  why_it_works: z.array(InsightPointSchema).min(3).max(6),
  devils_advocate: z.array(InsightPointSchema).min(3).max(6),
  income_bracket: z.enum(["lifestyle", "business"]),
  tags: z.array(z.string()).min(3).max(10),
});

const GeneratorSchema = z.object({
  ideas: z.array(GeneratedIdeaSchema).length(5),
});

type RecentIdea = {
  title: string;
  status: string;
  kill_reason: string | null;
  income_bracket: IncomeBracket | null;
};

type RecentQA = {
  idea_title: string;
  question: string;
  answer: string;
};

const QA_RECENT_LIMIT = 20;
const QA_RECENT_ANSWER_CHARS = 500;

function altBracket(last: IncomeBracket | null): IncomeBracket {
  // v2.1 fix: alternate from the last bracket, default lifestyle on null.
  if (last === "business") return "lifestyle";
  if (last === "lifestyle") return "business";
  return "lifestyle";
}

function buildPrompt(
  recent: RecentIdea[],
  killed: RecentIdea[],
  patterns: FeedbackPattern[],
  profileSummary: string | null,
  saturationNotes: string | null,
  nextBracket: IncomeBracket,
  recentQA: RecentQA[],
): string {
  const recentBlock = recent.length
    ? recent.map((r) => `- "${r.title}" (${r.status})`).join("\n")
    : "(none)";

  const killedBlock = killed.length
    ? killed
        .map(
          (k) =>
            `- "${k.title}" — ${k.kill_reason ?? "(no reason)"}`,
        )
        .join("\n")
    : "(none)";

  const likes = patterns.filter((p) => p.pattern_type === "like");
  const dislikes = patterns.filter((p) => p.pattern_type === "dislike");

  const likeBlock = likes.length
    ? likes.map((l) => `- ${l.pattern} (×${l.confidence})`).join("\n")
    : "(none)";
  const dislikeBlock = dislikes.length
    ? dislikes.map((d) => `- ${d.pattern} (×${d.confidence})`).join("\n")
    : "(none)";

  const qaBlock = recentQA.length
    ? recentQA
        .map((q) => {
          const ans =
            q.answer.length > QA_RECENT_ANSWER_CHARS
              ? `${q.answer.slice(0, QA_RECENT_ANSWER_CHARS)}…`
              : q.answer;
          return `- on "${q.idea_title}":\n    Q: ${q.question}\n    A: ${ans}`;
        })
        .join("\n")
    : "(none yet)";

  const saturationBlock =
    saturationNotes && saturationNotes.trim().length > 0
      ? saturationNotes.trim()
      : "(none flagged this cycle)";

  return `You are the idea generator for a single-user small-business idea pipeline. Generate 5 fresh ideas in one batch.

FOUNDER PROFILE:
${profileSummary ?? "(no profile yet — first run)"}

COOL-OFF / SATURATED ARCHETYPES (post-mortem flagged these as over-represented in the recent pool — actively avoid these shapes this batch, even if no dislike pattern matches):
${saturationBlock}

RECENT IDEAS (last 60 days — do not duplicate):
${recentBlock}

KILLED IDEAS (negative learning):
${killedBlock}

FOUNDER LIKES (lean toward these):
${likeBlock}

FOUNDER DISLIKES (avoid these — auto-kill triggers):
${dislikeBlock}

RECENT FOUNDER REASONING (last ${QA_RECENT_LIMIT} Q&A pairs across all ideas — soft priors for what the founder is currently interested in, worried about, or interrogating. NOT constraints — use as inspiration where it fits, ignore where it doesn't):
${qaBlock}

REQUIREMENTS:
1. Generate exactly 5 ideas.
2. Each idea picks a DIFFERENT combination of (domain × gtm_style × positioning). No two ideas can share all three. Include the tuple in tags, e.g. ["b2b", "content-marketing", "consultant-tool", ...].
3. Alternate income_bracket. The most recent idea was "${nextBracket === "business" ? "lifestyle" : nextBracket === "lifestyle" ? "business" : "(none)"}" — bias this batch toward "${nextBracket}" but include at least one of the other bracket.
4. Realistic month-12 MRR targets:
   - lifestyle bracket: $500–$2,000/mo solo side-project income
   - business bracket: $3,000–$8,000/mo as a real solo business
5. why_it_works and devils_advocate are EACH 3–6 short bullets. AT MOST ONE bullet per array is marked important=true (the single most-decisive claim). No "however"/"additionally" transitions — each bullet stands alone.
6. Where the RECENT FOUNDER REASONING above hints at angles the founder cares about (e.g. they keep interrogating distribution, or asking about a specific customer segment), let that inform — but never force-fit — at least one of the five ideas.

HARD EXCLUSIONS (do not generate any of these):
- Physical inventory or fulfillment
- Regulated industries (medical, legal advice, financial advice)
- Marketplace requiring both sides
- Hardware
- Anything requiring >12 weeks of solo MVP work
- Anything matching a dislike pattern above
- B2C consumer apps requiring paid ads from day 1
- Two-sided social products requiring network effects

Output shape (JSON):
{
  "ideas": [
    {
      "title": "5-12 words, specific",
      "description": "1-2 sentence description naming the customer and the wedge",
      "why_it_works": [{"text": "...", "important": false}, ...],
      "devils_advocate": [{"text": "...", "important": false}, ...],
      "income_bracket": "lifestyle" | "business",
      "tags": ["domain:<x>", "gtm:<y>", "positioning:<z>", ...]
    },
    ... 5 total
  ]
}`;
}

export async function handleGenerator(_run: RoutineRun): Promise<HandlerResult> {
  const sixtyDaysAgo = new Date(
    Date.now() - 60 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [recentRes, killedRes, patternsRes, profileRes, qaRes] =
    await Promise.all([
      supabase
        .from("ideas")
        .select("title, status, kill_reason, income_bracket")
        .gt("created_at", sixtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("ideas")
        .select("title, status, kill_reason, income_bracket")
        .eq("status", "killed")
        .order("killed_at", { ascending: false })
        .limit(30),
      supabase.from("feedback_patterns").select("*"),
      supabase
        .from("pipeline_profile")
        .select("summary, saturation_notes")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("idea_questions")
        .select("question, answer, ideas(title)")
        .gt("created_at", sixtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(QA_RECENT_LIMIT),
    ]);

  if (recentRes.error) throw new Error(`fetch recent: ${recentRes.error.message}`);
  if (killedRes.error) throw new Error(`fetch killed: ${killedRes.error.message}`);
  if (patternsRes.error)
    throw new Error(`fetch patterns: ${patternsRes.error.message}`);
  if (qaRes.error) throw new Error(`fetch qa: ${qaRes.error.message}`);

  const recent = (recentRes.data ?? []) as RecentIdea[];
  const killed = (killedRes.data ?? []) as RecentIdea[];
  const patterns = (patternsRes.data ?? []) as FeedbackPattern[];
  const profileRow = profileRes.data as
    | { summary: string | null; saturation_notes: string | null }
    | null;
  const profileSummary = profileRow?.summary ?? null;
  const saturationNotes = profileRow?.saturation_notes ?? null;
  const recentQA: RecentQA[] = (qaRes.data ?? [])
    .map((row) => {
      const r = row as {
        question: string;
        answer: string;
        ideas: { title: string } | { title: string }[] | null;
      };
      const ideaTitle = Array.isArray(r.ideas)
        ? r.ideas[0]?.title
        : r.ideas?.title;
      if (!ideaTitle) return null;
      return { idea_title: ideaTitle, question: r.question, answer: r.answer };
    })
    .filter((x): x is RecentQA => x !== null);

  const lastBracket = recent[0]?.income_bracket ?? null;
  const nextBracket = altBracket(lastBracket);

  const { value: out, cost } = await generateStructured({
    prompt: buildPrompt(
      recent,
      killed,
      patterns,
      profileSummary,
      saturationNotes,
      nextBracket,
      recentQA,
    ),
    schema: GeneratorSchema,
    model: "opus",
  });

  const rows = out.ideas.map((i) => ({
    title: i.title,
    description: i.description,
    why_it_works: i.why_it_works,
    devils_advocate: i.devils_advocate,
    income_bracket: i.income_bracket,
    tags: i.tags,
    status: "new" as const,
  }));

  const { data: inserted, error } = await supabase
    .from("ideas")
    .insert(rows)
    .select("id");
  if (error) throw new Error(`insert ideas: ${error.message}`);

  const ids = (inserted ?? []).map((r) => r.id);
  return {
    summary: `Generated ${ids.length} ideas (${ids.join(", ")})`,
    cost,
  };
}
