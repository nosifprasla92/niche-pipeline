import { describe, it, expect, beforeEach, vi } from "vitest";

// Build a chainable supabase-js mock per-test. Each `from()` produces a fresh
// builder; the test wires up which builder responds with which data/error.
// Methods chain: .update(p) / .select(c) / .insert(r) / .eq(...) (any chain length)
// and finally either resolve as `await` OR resolve via `.maybeSingle()`.
type BuilderResolver = { data?: unknown; error?: unknown };

type Builder = {
  __resolve: () => Promise<BuilderResolver>;
  update: (p: unknown) => Builder;
  select: (c?: string) => Builder;
  insert: (r: unknown) => Builder;
  eq: (...args: unknown[]) => Builder;
  maybeSingle: () => Promise<BuilderResolver>;
  then: <T>(onFulfilled: (v: BuilderResolver) => T) => Promise<T>;
};

function makeBuilder(resolver: () => BuilderResolver): Builder {
  const b: Builder = {
    __resolve: () => Promise.resolve(resolver()),
    update: () => b,
    select: () => b,
    insert: () => b,
    eq: () => b,
    maybeSingle: () => Promise.resolve(resolver()),
    then: (onFulfilled) => Promise.resolve(resolver()).then(onFulfilled),
  };
  return b;
}

// Per-test routing table: { tableName: resolver }
const tableHandlers = new Map<string, () => BuilderResolver>();

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ...actual,
    supabase: {
      from(table: string) {
        const resolver = tableHandlers.get(table) ?? (() => ({ data: null, error: null }));
        return makeBuilder(resolver);
      },
    },
  };
});

// Import after the mock is registered.
import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/update-idea", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  tableHandlers.clear();
});

describe("update-idea route", () => {
  describe("optimistic lock", () => {
    it("returns updated_at on a fresh expected_updated_at", async () => {
      let call = 0;
      tableHandlers.set("ideas", () => {
        call++;
        // First call is the status guard select (no status in patch so won't fire).
        // Update path returns the new updated_at as a one-row array.
        return { data: [{ updated_at: "2026-05-22T10:00:00Z" }], error: null };
      });

      const res = await POST(
        makeRequest({
          id: 42,
          patch: { business_plan: { checked_task_keys: ["1-3:0"] } },
          expected_updated_at: "2026-05-21T10:00:00Z",
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.updated_at).toBe("2026-05-22T10:00:00Z");
      expect(call).toBeGreaterThan(0);
    });

    it("returns 409 with current_updated_at when expected_updated_at is stale", async () => {
      let call = 0;
      tableHandlers.set("ideas", () => {
        call++;
        // First call: update with stale .eq returns 0 rows. Second: re-read maybeSingle
        // returns the current updated_at so the client can retry.
        if (call === 1) return { data: [], error: null };
        return { data: { updated_at: "2026-05-22T10:00:00Z" }, error: null };
      });

      const res = await POST(
        makeRequest({
          id: 42,
          patch: { business_plan: { checked_task_keys: ["1-3:0"] } },
          expected_updated_at: "2026-05-20T10:00:00Z",
        }),
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe("stale");
      expect(body.current_updated_at).toBe("2026-05-22T10:00:00Z");
    });
  });

  describe("status transition guard", () => {
    it("allows plan_ready → in_progress", async () => {
      let call = 0;
      tableHandlers.set("ideas", () => {
        call++;
        // First call: status guard select returns current status.
        if (call === 1) return { data: { status: "plan_ready" }, error: null };
        // Second: the update itself returns the new updated_at.
        return { data: [{ updated_at: "2026-05-21T10:00:00Z" }], error: null };
      });

      const res = await POST(
        makeRequest({
          id: 42,
          patch: { status: "in_progress" },
        }),
      );

      expect(res.status).toBe(200);
    });

    it("rejects killed → in_progress with 400 invalid_transition", async () => {
      tableHandlers.set("ideas", () => ({
        data: { status: "killed" },
        error: null,
      }));

      const res = await POST(
        makeRequest({
          id: 42,
          patch: { status: "in_progress" },
        }),
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_transition");
      expect(body.from).toBe("killed");
      expect(body.to).toBe("in_progress");
    });

    it("allows no-op same-status writes (e.g., patch resaving the same status)", async () => {
      let call = 0;
      tableHandlers.set("ideas", () => {
        call++;
        if (call === 1) return { data: { status: "in_progress" }, error: null };
        return { data: [{ updated_at: "2026-05-21T10:00:00Z" }], error: null };
      });

      const res = await POST(
        makeRequest({
          id: 42,
          patch: { status: "in_progress" },
        }),
      );

      expect(res.status).toBe(200);
    });
  });
});
