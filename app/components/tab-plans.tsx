"use client";
import useSWR from "swr";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea, BusinessPlan } from "@/lib/supabase";
import { Card } from "./card";
import { StatusPill } from "./status-pill";

export function TabPlans() {
  const { data, mutate } = useSWR<{ ideas: Idea[] }>(
    "/api/ideas?status=planning,plan_ready,in_progress",
    fetcher,
    { refreshInterval: 30000 },
  );
  const ideas = data?.ideas ?? [];

  if (!data) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (ideas.length === 0)
    return <div className="text-sm text-zinc-500">No plans yet. Approve a researched idea.</div>;

  return (
    <div className="space-y-4">
      {ideas.map((idea) => (
        <PlanCard key={idea.id} idea={idea} onChange={() => mutate()} />
      ))}
    </div>
  );
}

function PlanCard({ idea, onChange }: { idea: Idea; onChange: () => void }) {
  async function setStatus(status: string) {
    await fetch("/api/update-idea", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: idea.id, patch: { status } }),
    });
    onChange();
  }

  if (idea.status === "planning") {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-3">
          <StatusPill status={idea.status} />
          <span className="text-xs text-zinc-500">{formatDate(idea.updated_at)}</span>
        </div>
        <h3 className="text-lg font-semibold mb-1">{idea.title}</h3>
        <div className="animate-pulse text-sm text-zinc-500 mt-3">
          Building your plan… typically 2–5 minutes.
        </div>
      </Card>
    );
  }

  const plan = (idea.business_plan ?? {}) as BusinessPlan;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <StatusPill status={idea.status} />
        <span className="text-xs text-zinc-500">
          plan ready {idea.plan_ready_at && formatDate(idea.plan_ready_at)}
        </span>
      </div>
      <h3 className="text-xl font-semibold mb-3">{idea.title}</h3>

      {idea.first_actions && idea.first_actions.length > 0 && (
        <div className="mb-5 p-4 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
          <div className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-2">
            First 3 actions · do today
          </div>
          <ol className="list-decimal ml-5 space-y-1 text-sm">
            {idea.first_actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </div>
      )}

      <PlanSection title="Executive summary">{plan.executive_summary}</PlanSection>
      <PlanSection title="Target customer">{plan.target_customer}</PlanSection>
      <PlanSection title="Value proposition">{plan.value_proposition}</PlanSection>

      {plan.offer && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Offer</div>
          <div className="text-sm space-y-1">
            {plan.offer.product_or_service && <div><b>Product:</b> {plan.offer.product_or_service}</div>}
            {plan.offer.pricing_model && <div><b>Pricing:</b> {plan.offer.pricing_model}</div>}
            {plan.offer.landing_page_strategy && (
              <div><b>Landing page:</b> {plan.offer.landing_page_strategy}</div>
            )}
          </div>
        </div>
      )}

      {plan.go_to_market && plan.go_to_market.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Go to market</div>
          <ul className="list-disc ml-5 text-sm space-y-0.5">
            {plan.go_to_market.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.launch_plan_12_weeks && plan.launch_plan_12_weeks.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">12-week launch plan</div>
          <ol className="space-y-3">
            {plan.launch_plan_12_weeks.map((step, i) => (
              <li key={i} className="border-l-2 border-zinc-300 dark:border-zinc-700 pl-3">
                <div className="text-sm font-medium">
                  Weeks {step.weeks} · {step.title}
                </div>
                <ul className="list-disc ml-5 text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                  {step.tasks?.map((t, j) => <li key={j}>{t}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}

      {plan.tools_stack && plan.tools_stack.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Tools stack</div>
          <ul className="list-disc ml-5 text-sm">
            {plan.tools_stack.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {plan.financial_projection && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Financial projection</div>
          <div className="text-sm space-y-1">
            {plan.financial_projection.months_1_3 && <div><b>Months 1–3:</b> {plan.financial_projection.months_1_3}</div>}
            {plan.financial_projection.months_4_6 && <div><b>Months 4–6:</b> {plan.financial_projection.months_4_6}</div>}
            {plan.financial_projection.month_12 && <div><b>Month 12:</b> {plan.financial_projection.month_12}</div>}
          </div>
        </div>
      )}

      {plan.biggest_risks && plan.biggest_risks.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Biggest risks</div>
          <ul className="list-disc ml-5 text-sm">
            {plan.biggest_risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        {idea.status !== "in_progress" && (
          <button
            onClick={() => setStatus("in_progress")}
            className="px-3 py-1.5 text-sm rounded-md bg-violet-600 text-white hover:bg-violet-700"
          >
            Mark in progress
          </button>
        )}
        <button
          onClick={() => setStatus("launched")}
          className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Mark launched
        </button>
      </div>
    </Card>
  );
}

function PlanSection({ title, children }: { title: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{title}</div>
      <p className="text-sm">{children}</p>
    </div>
  );
}
