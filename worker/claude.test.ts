import { describe, it, expect, beforeEach, vi } from "vitest";
import { z } from "zod";

// Mock the Anthropic Agent SDK before importing the module under test.
// The SDK's `query()` is an async generator. Tests control what it yields per case.
type QueryMessage = Record<string, unknown>;
let queryMessages: QueryMessage[] = [];

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => {
    return (async function* () {
      for (const m of queryMessages) yield m;
    })();
  },
}));

import { generateStructured } from "./claude";

const Schema = z.object({ value: z.string() });

beforeEach(() => {
  queryMessages = [];
});

describe("worker/claude generateStructured", () => {
  it("returns cost when the SDK includes usage + total_cost_usd", async () => {
    queryMessages = [
      {
        type: "result",
        subtype: "success",
        result: JSON.stringify({ value: "ok" }),
        total_cost_usd: 0.0123,
        usage: { input_tokens: 100, output_tokens: 200 },
      },
    ];

    const out = await generateStructured({
      prompt: "test",
      schema: Schema,
      maxRetries: 0,
    });

    expect(out.value).toEqual({ value: "ok" });
    expect(out.cost).toEqual({
      input_tokens: 100,
      output_tokens: 200,
      cost_usd: 0.0123,
    });
  });

  it("coalesces undefined usage to NULLs without throwing", async () => {
    // The exact failure mode covered by codex D6 test item 3 (eng review):
    // SDK result message omits `usage`. Cost write path must NULL out rather
    // than crash the run.
    queryMessages = [
      {
        type: "result",
        subtype: "success",
        result: JSON.stringify({ value: "ok" }),
        // No total_cost_usd, no usage.
      },
    ];

    const out = await generateStructured({
      prompt: "test",
      schema: Schema,
      maxRetries: 0,
    });

    expect(out.value).toEqual({ value: "ok" });
    expect(out.cost).toEqual({
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    });
  });

  it("coalesces non-number usage values to NULL", async () => {
    // Defensive: a future SDK shape change that delivers garbage shouldn't
    // make the cost path throw and lose an otherwise-successful run.
    queryMessages = [
      {
        type: "result",
        subtype: "success",
        result: JSON.stringify({ value: "ok" }),
        total_cost_usd: "not a number",
        usage: { input_tokens: NaN, output_tokens: undefined },
      },
    ];

    const out = await generateStructured({
      prompt: "test",
      schema: Schema,
      maxRetries: 0,
    });

    expect(out.cost).toEqual({
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    });
  });
});
