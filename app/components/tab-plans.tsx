"use client";
import useSWR from "swr";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea, BusinessPlan } from "@/lib/supabase";
import { Card } from "./card";
import { StatusPill } from "./status-pill";

export function TabPlans() {
  const { data, mutate } = useSWR<{ ideas: Idea[] }>(
    "/api/ideas?status=planning,plan_ready",
    fetcher,
    { refreshInterval: 30000 },
  );
  const ideas = data?.ideas ?? [];

  if (!data) return <div className="text-sm text-muted">Loading…</div>;
  if (ideas.length === 0)
    return <div className="text-sm text-muted">No plans yet. Approve a researched idea.</div>;

  return (
    <div className="space-y-6 max-w-[720px]">
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
        <div className="flex items-center gap-3 mb-4">
          <StatusPill status={idea.status} />
          <span className="font-mono text-xs text-muted">{formatDate(idea.updated_at)}</span>
        </div>
        <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
        <div className="animate-pulse font-mono text-xs uppercase tracking-wider text-muted mt-3">
          Building your plan… typically 2–5 minutes.
        </div>
      </Card>
    );
  }

  const plan = (idea.business_plan ?? {}) as BusinessPlan;

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <StatusPill status={idea.status} />
        <span className="font-mono text-xs text-muted">
          plan ready {idea.plan_ready_at && formatDate(idea.plan_ready_at)}
        </span>
      </div>
      <h3 className="font-display text-3xl leading-tight mb-5">{idea.title}</h3>

      {idea.first_actions && idea.first_actions.length > 0 && (
        <div className="mb-6 p-4 rounded-md border border-accent/30 bg-accent/5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-accent mb-2">
            First 3 actions · do today
          </div>
          <ol className="list-decimal ml-5 space-y-1 text-sm leading-relaxed">
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
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">Offer</div>
          <div className="text-sm space-y-1 leading-relaxed">
            {plan.offer.product_or_service && <div><b>Product:</b> {plan.offer.product_or_service}</div>}
            {plan.offer.pricing_model && <div><b>Pricing:</b> {plan.offer.pricing_model}</div>}
            {plan.offer.landing_page_strategy && (
              <div><b>Landing page:</b> {plan.offer.landing_page_strategy}</div>
            )}
          </div>
        </div>
      )}

      {plan.go_to_market_zero_paid && plan.go_to_market_zero_paid.length > 0 && (
        <div className="mb-4">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">
            Go to market — zero paid (first 10 customers)
          </div>
          <ul className="list-disc ml-5 text-sm space-y-0.5 leading-relaxed">
            {plan.go_to_market_zero_paid.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.go_to_market_paid_after_10_customers &&
        plan.go_to_market_paid_after_10_customers.length > 0 && (
          <div className="mb-4">
            <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">
              Go to market — paid (after 10 customers)
            </div>
            <ul className="list-disc ml-5 text-sm space-y-0.5 leading-relaxed">
              {plan.go_to_market_paid_after_10_customers.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}

      {plan.launch_plan_12_weeks && plan.launch_plan_12_weeks.length > 0 && (
        <div className="mb-4">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-2">12-week launch plan</div>
          <ol className="space-y-3">
            {plan.launch_plan_12_weeks.map((step, i) => (
              <li key={i} className="border-l-2 border-border pl-3">
                <div className="text-sm font-medium">
                  Weeks {step.weeks} · {step.title}
                </div>
                <ul className="list-disc ml-5 text-sm text-muted mt-1 leading-relaxed">
                  {step.tasks?.map((t, j) => <li key={j}>{t}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}

      {plan.tools_stack && plan.tools_stack.length > 0 && (
        <div className="mb-4">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">Tools stack</div>
          <ul className="list-disc ml-5 text-sm leading-relaxed">
            {plan.tools_stack.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {plan.financial_projection && (
        <div className="mb-4">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">Financial projection</div>
          <div className="text-sm space-y-1 leading-relaxed">
            {plan.financial_projection.months_1_3 && <div><b>Months 1–3:</b> {plan.financial_projection.months_1_3}</div>}
            {plan.financial_projection.months_4_6 && <div><b>Months 4–6:</b> {plan.financial_projection.months_4_6}</div>}
            {plan.financial_projection.month_12 && <div><b>Month 12:</b> {plan.financial_projection.month_12}</div>}
          </div>
        </div>
      )}

      {plan.biggest_risks && plan.biggest_risks.length > 0 && (
        <div className="mb-4">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">Biggest risks</div>
          <ul className="list-disc ml-5 text-sm leading-relaxed">
            {plan.biggest_risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {plan.kill_conditions && plan.kill_conditions.length > 0 && (
        <div className="mb-4">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">Kill conditions</div>
          <ul className="list-disc ml-5 text-sm leading-relaxed">
            {plan.kill_conditions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-2 mt-5">
        <button
          onClick={() => setStatus("launched")}
          className="px-4 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90 transition-opacity"
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
    <div className="mb-4">
      <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-1.5">{title}</div>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  );
}
