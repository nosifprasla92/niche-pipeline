import { NextRequest, NextResponse } from "next/server";
import { supabase, ALLOWED_TRANSITIONS, type Status } from "@/lib/supabase";

type Body = {
  id: number;
  patch?: Record<string, unknown>;
  expected_updated_at?: string;
  feedback?: { pattern_type: "like" | "dislike"; pattern: string };
};

// PATCH endpoint for ideas. Two protections layered on the existing generic-patch shape:
//   1. Optimistic lock: if the client passes expected_updated_at, scope the update with
//      .eq("updated_at", expected_updated_at). 0 rows returned ⇒ 409 stale, client retries
//      with a fresh read. Used by the Plan C checklist toggle so concurrent ticks can't
//      lose updates inside the business_plan jsonb.
//   2. Status transition guard: when patch contains a `status` field, fetch the current
//      status and reject moves not in ALLOWED_TRANSITIONS (e.g., killed → in_progress).
//      Interim protection until the TODOS P3 Postgres CHECK constraint lands.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const { id, patch, expected_updated_at, feedback } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let newUpdatedAt: string | null = null;

  if (patch && Object.keys(patch).length > 0) {
    if (typeof patch.status === "string") {
      const guardErr = await guardStatusTransition(id, patch.status as Status);
      if (guardErr) return guardErr;
    }

    const query = supabase.from("ideas").update(patch).eq("id", id);
    if (expected_updated_at) query.eq("updated_at", expected_updated_at);

    const { data, error } = await query.select("updated_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) {
      if (expected_updated_at) {
        const { data: fresh } = await supabase
          .from("ideas")
          .select("updated_at")
          .eq("id", id)
          .maybeSingle();
        if (!fresh) {
          // Row deleted between client read and PATCH. Returning 409 would
          // make the client retry forever; 404 lets it surface "gone."
          return NextResponse.json({ error: "not_found" }, { status: 404 });
        }
        return NextResponse.json(
          { error: "stale", current_updated_at: fresh.updated_at },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    newUpdatedAt = data[0].updated_at as string;
  }

  if (feedback?.pattern) {
    const { error } = await supabase.from("feedback_patterns").insert({
      pattern_type: feedback.pattern_type,
      pattern: feedback.pattern,
      source_idea_id: id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated_at: newUpdatedAt });
}

async function guardStatusTransition(
  ideaId: number,
  next: Status,
): Promise<NextResponse | null> {
  const { data, error } = await supabase
    .from("ideas")
    .select("status")
    .eq("id", ideaId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const current = data.status as Status;
  if (current === next) return null;
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    return NextResponse.json(
      { error: "invalid_transition", from: current, to: next },
      { status: 400 },
    );
  }
  return null;
}
