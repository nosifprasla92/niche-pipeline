import { query } from "@anthropic-ai/claude-agent-sdk";
import type { z, ZodType } from "zod";

// Thin wrapper around the Claude Agent SDK that turns a prompt + Zod schema
// into a validated object. Authenticates via the user's Max OAuth session
// stored in macOS Keychain (same auth the `claude` CLI uses). NO API key.
//
// Why not the Vercel AI SDK's generateObject? Because that hits the AI Gateway
// (or a direct provider), which bills credits. The whole point of this worker
// is to stop billing credits. The SDK below talks to the same session your
// terminal does and charges the Max plan instead.

export type GenerateOptions<S extends ZodType> = {
  prompt: string;
  schema: S;
  /** "sonnet" | "opus" | "haiku" or a full model ID. Defaults to "sonnet". */
  model?: string;
  systemPrompt?: string;
  /** How many parse retries on top of the first attempt. Default 1 (2 total). */
  maxRetries?: number;
  /**
   * Hard ceiling per SDK call, milliseconds. Triggers AbortController.abort()
   * if the model hasn't returned a `result` message within the window.
   *
   * Default 15 minutes. Rationale: tools are disabled, so the SDK can only
   * "think and respond" — no agent loop. A legitimate slow Opus run on the
   * planner/generator schemas peaks around 8-10 min. 15 min is generous
   * headroom; anything past that is almost certainly hung, not thinking.
   *
   * TUNE: if you start seeing "claude.timeout" warnings on real (not hung)
   * runs, bump this. If runs routinely finish in <2 min, you could drop it.
   * Adjust based on duration column in routine_runs over a week of data.
   */
  timeoutMs?: number;
};

export const DEFAULT_TIMEOUT_MS = 15 * 60_000;

export async function generateStructured<S extends ZodType>(
  opts: GenerateOptions<S>,
): Promise<z.infer<S>> {
  const jsonInstruction =
    "\n\nRespond with ONLY a valid JSON object matching the structure the prompt describes. " +
    "No prose before or after. No markdown code fences. No commentary. " +
    "Just the raw JSON.";
  const fullPrompt = opts.prompt + jsonInstruction;

  const tries = (opts.maxRetries ?? 1) + 1;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const text = await runQuery(fullPrompt, opts);
      const json = extractJson(text);
      return opts.schema.parse(json);
    } catch (err) {
      lastErr = err;
      if (attempt < tries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("generateStructured: unknown failure");
}

async function runQuery<S extends ZodType>(
  prompt: string,
  opts: GenerateOptions<S>,
): Promise<string> {
  let finalText = "";
  let errorText: string | null = null;

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const abortController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, timeoutMs);

  try {
    for await (const msg of query({
      prompt,
      options: {
        model: opts.model ?? "sonnet",
        systemPrompt: opts.systemPrompt
          ? { type: "preset", preset: "claude_code", append: opts.systemPrompt }
          : undefined,
        // Disable all tools — pure text generation, not an agent loop.
        allowedTools: [],
        maxTurns: 1,
        // Don't load CLAUDE.md / settings.json / etc.
        settingSources: [],
        permissionMode: "bypassPermissions",
        abortController,
      },
    })) {
      if (msg.type === "result") {
        if (msg.subtype === "success") {
          finalText = msg.result;
        } else {
          errorText = `Claude returned ${msg.subtype}`;
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  if (timedOut) {
    throw new Error(
      `claude.timeout: SDK call exceeded ${Math.round(timeoutMs / 1000)}s — likely hung. Bump timeoutMs if legit slow runs are tripping this.`,
    );
  }
  if (errorText) throw new Error(errorText);
  if (!finalText) throw new Error("Claude returned no result text");
  return finalText;
}

function extractJson(text: string): unknown {
  let cleaned = text.trim();
  // Strip ```json … ``` fences if the model wrapped output despite instructions.
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```\s*$/, "");
  }
  // Some models leak a leading "Here is the JSON:" — try to find the first '{'.
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");
    const start =
      firstBrace === -1
        ? firstBracket
        : firstBracket === -1
          ? firstBrace
          : Math.min(firstBrace, firstBracket);
    if (start > 0) cleaned = cleaned.slice(start);
  }
  return JSON.parse(cleaned);
}
