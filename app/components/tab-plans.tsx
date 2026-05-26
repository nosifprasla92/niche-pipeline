"use client";
import { useState } from "react";
import useSWR from "swr";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea, BusinessPlan, normalizeTask } from "@/lib/supabase";
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

      <PlanSection title="Executive summary" titleColor="text-accent">{plan.executive_summary}</PlanSection>
      <PlanSection title="Target customer" titleColor="text-info">{plan.target_customer}</PlanSection>
      <PlanSection title="Value proposition" titleColor="text-success">{plan.value_proposition}</PlanSection>

      {plan.offer && (
        <div className="mb-5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-accent mb-2">Offer</div>
          <div className="text-sm space-y-1.5 leading-relaxed max-w-[65ch]">
            {plan.offer.product_or_service && <div><span className="font-medium text-text">Product:</span> {plan.offer.product_or_service}</div>}
            {plan.offer.pricing_model && <div><span className="font-medium text-text">Pricing:</span> {plan.offer.pricing_model}</div>}
            {plan.offer.landing_page_strategy && (
              <div><span className="font-medium text-text">Landing page:</span> {plan.offer.landing_page_strategy}</div>
            )}
          </div>
        </div>
      )}

      {plan.go_to_market_zero_paid && plan.go_to_market_zero_paid.length > 0 && (
        <div className="mb-5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-success mb-2">
            Go to market — zero paid (first 10 customers)
          </div>
          <ul className="list-disc ml-5 text-sm space-y-1 leading-relaxed max-w-[65ch]">
            {plan.go_to_market_zero_paid.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.go_to_market_paid_after_10_customers &&
        plan.go_to_market_paid_after_10_customers.length > 0 && (
          <div className="mb-5">
            <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-info mb-2">
              Go to market — paid (after 10 customers)
            </div>
            <ul className="list-disc ml-5 text-sm space-y-1 leading-relaxed max-w-[65ch]">
              {plan.go_to_market_paid_after_10_customers.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}

      {plan.launch_plan_12_weeks && plan.launch_plan_12_weeks.length > 0 && (
        <div className="mb-5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-accent mb-2">12-week launch plan</div>
          <ol className="space-y-3">
            {plan.launch_plan_12_weeks.map((step, i) => (
              <li key={i} className="border-l-2 border-accent/30 pl-3">
                <div className="text-sm font-medium">
                  <span className="text-accent">Weeks {step.weeks}</span> · {step.title}
                </div>
                <ul className="mt-1 space-y-1">
                  {step.tasks?.map((raw, j) => {
                    const t = normalizeTask(raw as any);
                    return <PlanTaskItem key={j} detail={t} />;
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}

      {plan.tools_stack && plan.tools_stack.length > 0 && (
        <div className="mb-5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted mb-2">Tools stack</div>
          <ul className="list-disc ml-5 text-sm leading-relaxed">
            {plan.tools_stack.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {plan.financial_projection && (
        <div className="mb-5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-success mb-2">Financial projection</div>
          <div className="text-sm space-y-1.5 leading-relaxed max-w-[65ch]">
            {plan.financial_projection.months_1_3 && <div><span className="font-medium text-text">Months 1–3:</span> {plan.financial_projection.months_1_3}</div>}
            {plan.financial_projection.months_4_6 && <div><span className="font-medium text-text">Months 4–6:</span> {plan.financial_projection.months_4_6}</div>}
            {plan.financial_projection.month_12 && <div><span className="font-medium text-text">Month 12:</span> {plan.financial_projection.month_12}</div>}
          </div>
        </div>
      )}

      {plan.biggest_risks && plan.biggest_risks.length > 0 && (
        <div className="mb-5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-warning mb-2">Biggest risks</div>
          <ul className="list-disc ml-5 text-sm leading-relaxed marker:text-warning/50">
            {plan.biggest_risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {plan.kill_conditions && plan.kill_conditions.length > 0 && (
        <div className="mb-5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-error mb-2">Kill conditions</div>
          <ul className="list-disc ml-5 text-sm leading-relaxed marker:text-error/50">
            {plan.kill_conditions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-2 mt-5">
        <button
          onClick={() => setStatus("in_progress")}
          className="px-4 py-1.5 text-sm rounded-md bg-accent text-white hover:opacity-90 transition-opacity"
        >
          Start executing
        </button>
        <button
          onClick={() => setStatus("launched")}
          className="px-4 py-1.5 text-sm rounded-md border border-border text-text hover:bg-border/60 transition-colors"
        >
          Skip to launched
        </button>
      </div>
    </Card>
  );
}

function PlanTaskItem({ detail }: { detail: { task: string; steps: string[] } }) {
  const [open, setOpen] = useState(false);
  const hasSteps = detail.steps.length > 0;

  return (
    <li className="text-sm text-text/80 leading-relaxed">
      <div className="flex items-start gap-1.5">
        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-text/30 shrink-0" />
        <span className="flex-1">
          {detail.task}
          {hasSteps && (
            <button
              onClick={() => setOpen(!open)}
              className="ml-1.5 font-mono text-[0.625rem] text-accent/70 hover:text-accent"
            >
              {open ? "hide steps" : `${detail.steps.length} steps`}
            </button>
          )}
        </span>
      </div>
      {open && hasSteps && (
        <ol className="ml-4 mt-1 mb-1 space-y-0.5 border-l border-accent/20 pl-3">
          {detail.steps.map((s, i) => (
            <li key={i} className="text-xs text-text/70 leading-relaxed">{s}</li>
          ))}
        </ol>
      )}
    </li>
  );
}

function PlanSection({ title, titleColor = "text-muted", children }: { title: string; titleColor?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-5">
      <div className={`font-mono text-[0.6875rem] uppercase tracking-wider ${titleColor} mb-2`}>{title}</div>
      <p className="text-sm leading-relaxed whitespace-pre-line max-w-[65ch]">{children}</p>
    </div>
  );
}
