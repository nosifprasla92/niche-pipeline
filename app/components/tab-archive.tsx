"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea, BusinessPlan } from "@/lib/supabase";
import { StatusPill } from "./status-pill";
import { InsightList } from "./insight-list";

const FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "killed", label: "Killed", match: (i: Idea) => i.status === "killed" },
  { id: "launched", label: "Launched", match: (i: Idea) => i.status === "launched" },
];

export function TabArchive() {
  const { data } = useSWR<{ ideas: Idea[] }>(
    "/api/ideas?status=killed,launched",
    fetcher,
    { refreshInterval: 30000 },
  );
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Idea | null>(null);

  const filtered = useMemo(() => {
    const ideas = data?.ideas ?? [];
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
    return ideas
      .filter(f.match)
      .filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));
  }, [data, filter, search]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4 sm:items-center">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-2 sm:py-1 text-sm rounded-sm border transition-colors ${
                filter === f.id
                  ? "bg-text text-bg border-transparent"
                  : "border-border text-text hover:bg-border/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search titles…"
          className="sm:ml-auto w-full sm:w-auto text-sm px-3 py-2.5 sm:py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
        />
      </div>

      {/* Mobile: card list */}
      <div className="sm:hidden space-y-2">
        {filtered.map((idea) => (
          <button
            key={idea.id}
            onClick={() => setOpen(idea)}
            className="w-full text-left bg-surface border border-border rounded-md p-3 active:bg-border/30 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <StatusPill status={idea.status} />
              <span className="font-mono text-xs text-muted">{formatDate(idea.updated_at)}</span>
            </div>
            <div className="text-sm">{idea.title}</div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted">No ideas match.</div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block border border-border rounded-md overflow-hidden bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-border/40 text-left">
            <tr>
              <th className="px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-wider text-muted">Title</th>
              <th className="px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-wider text-muted">Status</th>
              <th className="px-3 py-2 font-mono text-[0.6875rem] uppercase tracking-wider text-muted">Updated</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((idea) => (
              <tr
                key={idea.id}
                className="border-t border-border"
              >
                <td className="px-3 py-2.5">{idea.title}</td>
                <td className="px-3 py-2.5">
                  <StatusPill status={idea.status} />
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-muted">{formatDate(idea.updated_at)}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => setOpen(idea)}
                    className="text-accent underline underline-offset-2 decoration-accent/40 hover:decoration-accent"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted">
                  No ideas match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(null)}
        >
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-surface overflow-y-auto p-4 sm:p-6 border-l border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(null)}
              className="text-sm text-muted hover:text-text mb-3"
            >
              Close ×
            </button>
            <div className="flex items-center gap-3 mb-4">
              <StatusPill status={open.status} />
              <span className="font-mono text-xs text-muted">{formatDate(open.updated_at)}</span>
            </div>
            <h3 className="font-display text-2xl leading-tight mb-3">{open.title}</h3>
            <p className="text-base text-text/90 leading-relaxed mb-5 whitespace-pre-line max-w-[65ch]">{open.description}</p>

            {open.tags && open.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {open.tags.map((t) => (
                  <span
                    key={t}
                    className="font-mono text-[0.6875rem] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-accent/8 text-accent/80"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {open.kill_reason && (
              <DrawerSection title="Kill reason" titleColor="text-error">{open.kill_reason}</DrawerSection>
            )}

            {open.why_it_works?.length > 0 && (
              <div className="mb-5">
                <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-success mb-2">Why this works</div>
                <InsightList points={open.why_it_works} tone="positive" />
              </div>
            )}

            {open.devils_advocate?.length > 0 && (
              <div className="mb-5">
                <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-warning mb-2">Devil&rsquo;s advocate</div>
                <InsightList points={open.devils_advocate} tone="cautionary" />
              </div>
            )}

            <DrawerSection title="Competitive landscape">{open.competition_analysis}</DrawerSection>
            <DrawerSection title="Competitor complaints" titleColor="text-warning">{open.competitor_complaints}</DrawerSection>
            <DrawerSection title="Effort to launch">{open.effort_breakdown}</DrawerSection>
            <DrawerSection title="Zero-paid path" titleColor="text-success">{open.zero_paid_path}</DrawerSection>

            <DrawerSection title="Landing page copy" titleColor="text-accent">{open.landing_copy}</DrawerSection>
            <DrawerSection title="Interview script" titleColor="text-info">{open.interview_questions}</DrawerSection>
            <DrawerSection title="Ad test plan" titleColor="text-warning">{open.ad_test_plan}</DrawerSection>
            <DrawerSection title="Validation signals" titleColor="text-success">{open.validation_signals}</DrawerSection>

            <ArchivePlanSummary plan={open.business_plan} />
          </div>
        </div>
      )}
    </div>
  );
}

function DrawerSection({ title, titleColor = "text-muted", children }: { title: string; titleColor?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-5">
      <div className={`font-mono text-[0.6875rem] uppercase tracking-wider ${titleColor} mb-2`}>{title}</div>
      <p className="text-sm leading-relaxed whitespace-pre-line max-w-[65ch]">{children}</p>
    </div>
  );
}

function ArchivePlanSummary({ plan }: { plan: BusinessPlan | null }) {
  if (!plan) return null;
  return (
    <>
      {plan.executive_summary && (
        <div className="mb-5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-accent mb-2">Executive summary</div>
          <p className="text-sm leading-relaxed whitespace-pre-line max-w-[65ch]">{plan.executive_summary}</p>
        </div>
      )}
      {plan.value_proposition && (
        <div className="mb-5">
          <div className="font-mono text-[0.6875rem] uppercase tracking-wider text-success mb-2">Value proposition</div>
          <p className="text-sm leading-relaxed whitespace-pre-line max-w-[65ch]">{plan.value_proposition}</p>
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
    </>
  );
}
