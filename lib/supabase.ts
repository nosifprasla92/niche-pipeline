import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.warn("[supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY is missing");
}

export const supabase = createClient(url ?? "http://localhost", key ?? "missing", {
  auth: { persistSession: false },
});

export type Status =
  | "new"
  | "pursuing"
  | "researched"
  | "validating"
  | "validated"
  | "planning"
  | "plan_ready"
  | "launched"
  | "killed";

export type IncomeBracket = "lifestyle" | "business";

export type InsightPoint = {
  text: string;
  important?: boolean;
};

export type Idea = {
  id: number;
  created_at: string;
  updated_at: string;
  title: string;
  description: string;
  tags: string[] | null;
  why_it_works: InsightPoint[];
  devils_advocate: InsightPoint[];
  status: Status;
  income_bracket: IncomeBracket | null;

  // Research output
  competitors_above_50: number | null;
  competitor_complaints: string | null;
  competition_analysis: string | null;
  effort_weeks: number | null;
  effort_breakdown: string | null;
  zero_paid_path: string | null;
  researched_at: string | null;

  // Validation kit (routine 3)
  landing_copy: string | null;
  interview_questions: string | null;
  ad_test_plan: string | null;
  validation_signals: string | null;
  validated_at: string | null;

  // Plan
  business_plan: BusinessPlan | null;
  first_actions: string[] | null;
  plan_ready_at: string | null;

  // Kill
  kill_reason: string | null;
  killed_at: string | null;

  user_notes: string | null;
};

export type BusinessPlan = {
  executive_summary?: string;
  target_customer?: string;
  value_proposition?: string;
  offer?: {
    product_or_service?: string;
    pricing_model?: string;
    landing_page_strategy?: string;
  };
  go_to_market_zero_paid?: string[];
  go_to_market_paid_after_10_customers?: string[];
  launch_plan_12_weeks?: { weeks: string; title: string; tasks: string[] }[];
  tools_stack?: string[];
  financial_projection?: {
    months_1_3?: string;
    months_4_6?: string;
    month_12?: string;
  };
  biggest_risks?: string[];
  kill_conditions?: string[];
};

export type FeedbackPattern = {
  id: number;
  created_at: string;
  pattern_type: "like" | "dislike";
  pattern: string;
  confidence: number;
  source_idea_id: number | null;
};

export type RoutineName =
  | "generator"
  | "researcher"
  | "validator"
  | "planner"
  | "postmortem";

export type RoutineRunStatus =
  | "triggered"
  | "accepted"
  | "fire_failed"
  | "completed"
  | "error"
  | "timed_out"
  | "cancelled";

export type TriggeredBy = "cron" | "ui" | "callback";

export type RoutineRun = {
  id: number;
  routine_name: RoutineName;
  started_at: string;
  finished_at: string | null;
  status: RoutineRunStatus;
  triggered_by: TriggeredBy;
  idea_context_id: number | null;
  error_message: string | null;
  fire_response_body: string | null;
  summary: string | null;
};
