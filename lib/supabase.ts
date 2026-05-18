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
  | "planning"
  | "plan_ready"
  | "in_progress"
  | "launched"
  | "passed";

export type Idea = {
  id: number;
  created_at: string;
  updated_at: string;
  title: string;
  description: string;
  tags: string[] | null;
  why_it_works: string;
  devils_advocate: string;
  status: Status;
  competition_score: number | null;
  competition_analysis: string | null;
  effort_weeks: number | null;
  effort_breakdown: string | null;
  marketing_cost_3mo: number | null;
  marketing_breakdown: string | null;
  researched_at: string | null;
  business_plan: BusinessPlan | null;
  first_actions: string[] | null;
  plan_ready_at: string | null;
  user_notes: string | null;
  passed_reason: string | null;
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
  go_to_market?: string[];
  launch_plan_12_weeks?: { weeks: string; title: string; tasks: string[] }[];
  tools_stack?: string[];
  financial_projection?: {
    months_1_3?: string;
    months_4_6?: string;
    month_12?: string;
  };
  biggest_risks?: string[];
};

export type FeedbackPattern = {
  id: number;
  created_at: string;
  pattern_type: "like" | "dislike";
  pattern: string;
  confidence: number;
  source_idea_id: number | null;
};
