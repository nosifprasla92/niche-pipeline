"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import useSWR from "swr";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea, BusinessPlan, normalizeTask } from "@/lib/supabase";
import { Card } from "./card";
import { StatusPill } from "./status-pill";
import { Checkbox } from "./checkbox";
import { CelebrationToast } from "./celebration-toast";

type LaunchWeek = NonNullable<BusinessPlan["launch_plan_12_weeks"]>[number];

function taskKey(phase: LaunchWeek, taskIndex: number): string {
  return `${phase.weeks}:${taskIndex}`;
}

function planTaskKeys(plan: BusinessPlan | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!plan?.launch_plan_12_weeks) return out;
  for (const phase of plan.launch_plan_12_weeks) {
    const tasks = phase.tasks ?? [];
    for (let i = 0; i < tasks.length; i++) {
      out.add(taskKey(phase, i));
    }
  }
  return out;
}

function readCheckedKeys(plan: BusinessPlan | null | undefined): string[] {
  // The plan's `checked_task_keys` is a Plan C extension stored on business_plan;
  // older plans won't have it. Read defensively from a typed-as-unknown view.
  const maybe = (plan as unknown as { checked_task_keys?: unknown } | null)
    ?.checked_task_keys;
  if (!Array.isArray(maybe)) return [];
  return maybe.filter((v): v is string => typeof v === "string");
}

export function TabInProgress() {
  const { data, error, mutate } = useSWR<{ ideas: Idea[] }>(
    "/api/ideas?status=in_progress",
    fetcher,
    { refreshInterval: 30000 },
  );
  const ideas = data?.ideas ?? [];

  if (error) {
    return (
      <div className="text-sm leading-relaxed">
        <div className="text-error mb-2">Couldn&rsquo;t load execution plans.</div>
        <button
          onClick={() => mutate()}
          className="px-3 py-2 text-xs rounded-md border border-border text-text hover:bg-border/60 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 max-w-[720px]">
        <SkeletonPlan />
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="text-base text-muted leading-relaxed">
          Approved plans show up here.
          <br />
          Approve one to start executing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[720px]">
      {ideas.map((idea) => (
        <InProgressCard key={idea.id} idea={idea} onChange={() => mutate()} />
      ))}
    </div>
  );
}

function SkeletonPlan() {
  return (
    <Card>
      <div className="animate-pulse">
        <div className="h-3 w-32 bg-border rounded-sm mb-4" />
        <div className="h-8 w-3/4 bg-border rounded-sm mb-6" />
        <div className="space-y-3">
          <div className="h-4 w-1/2 bg-border rounded-sm" />
          <div className="h-4 w-2/3 bg-border rounded-sm" />
          <div className="h-4 w-1/2 bg-border rounded-sm" />
        </div>
      </div>
    </Card>
  );
}

function InProgressCard({ idea, onChange }: { idea: Idea; onChange: () => void }) {
  const plan = (idea.business_plan ?? null) as BusinessPlan | null;
  const phases = plan?.launch_plan_12_weeks ?? [];

  const validKeys = useMemo(() => planTaskKeys(plan), [plan]);
  const rawChecked = useMemo(() => readCheckedKeys(plan), [plan]);
  const checkedKeys = useMemo(
    () => new Set(rawChecked.filter((k) => validKeys.has(k))),
    [rawChecked, validKeys],
  );
  const hasOrphanChecks = rawChecked.length > checkedKeys.size;

  // Local optimistic state layered on top of the server's checkedKeys. `pending`
  // tracks per-task in-flight writes so rapid double-clicks can't issue parallel
  // PATCHes with the same expected_updated_at.
  const [optimistic, setOptimistic] = useState<Map<string, boolean>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One-shot guard so two rapid ticks can't both compute allDone=true from
  // closure-captured state and double-fire advanceToLaunched(). Reset only on
  // unmount or after undo.
  const advancingRef = useRef(false);

  function isChecked(key: string): boolean {
    if (optimistic.has(key)) return optimistic.get(key)!;
    return checkedKeys.has(key);
  }

  const totalTasks = useMemo(() => {
    let n = 0;
    for (const p of phases) n += (p.tasks ?? []).length;
    return n;
  }, [phases]);

  const completedTasks = useMemo(() => {
    let n = 0;
    for (const p of phases) {
      const tasks = p.tasks ?? [];
      for (let i = 0; i < tasks.length; i++) {
        if (isChecked(taskKey(p, i))) n++;
      }
    }
    return n;
    // optimistic + checkedKeys are the source; recompute when either changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases, optimistic, checkedKeys]);

  const toggleTask = useCallback(
    async (key: string, next: boolean) => {
      if (pending.has(key)) return;
      setPending((p) => new Set(p).add(key));
      setOptimistic((m) => new Map(m).set(key, next));
      setError(null);

      try {
        // Build the new array from the server's current state, then layer this toggle.
        const currentSet = new Set(readCheckedKeys(plan));
        if (next) currentSet.add(key);
        else currentSet.delete(key);

        const nextPlan = { ...(plan ?? {}), checked_task_keys: Array.from(currentSet) };

        const res = await fetch("/api/update-idea", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: idea.id,
            patch: { business_plan: nextPlan },
            expected_updated_at: idea.updated_at,
          }),
        });

        if (res.status === 409) {
          // Stale. Refresh and let SWR re-render; the user can re-tick.
          await onChange();
          setOptimistic((m) => {
            const m2 = new Map(m);
            m2.delete(key);
            return m2;
          });
          setError("That tick raced with another change. Try again.");
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? `HTTP ${res.status}`);
          setOptimistic((m) => {
            const m2 = new Map(m);
            m2.delete(key);
            return m2;
          });
          return;
        }

        await onChange();
        setOptimistic((m) => {
          const m2 = new Map(m);
          m2.delete(key);
          return m2;
        });

        // Auto-advance: did this tick complete the last task?
        if (next && !advancingRef.current) {
          const after = new Set(currentSet);
          let allDone = totalTasks > 0;
          for (const p of phases) {
            const tasks = p.tasks ?? [];
            for (let i = 0; i < tasks.length; i++) {
              if (!after.has(taskKey(p, i))) {
                allDone = false;
                break;
              }
            }
            if (!allDone) break;
          }
          if (allDone) {
            advancingRef.current = true;
            await advanceToLaunched();
          }
        }
      } finally {
        setPending((p) => {
          const p2 = new Set(p);
          p2.delete(key);
          return p2;
        });
      }
    },
    [idea, plan, phases, totalTasks, onChange, pending],
  );

  async function advanceToLaunched() {
    const res = await fetch("/api/update-idea", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: idea.id, patch: { status: "launched" } }),
    });
    if (res.ok) {
      setCelebration(true);
      await onChange();
    } else {
      setError("Failed to mark launched. Click 'Mark launched' manually.");
    }
  }

  async function undoLaunch() {
    setCelebration(false);
    const res = await fetch("/api/update-idea", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: idea.id, patch: { status: "in_progress" } }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body.error ? `Undo failed: ${body.error}` : `Undo failed (HTTP ${res.status})`,
      );
    } else {
      // Allow another auto-advance after a successful undo.
      advancingRef.current = false;
    }
    await onChange();
  }

  // First incomplete phase expanded by default; others collapsed.
  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    for (const p of phases) {
      const tasks = p.tasks ?? [];
      const allDone = tasks.every((_, i) => isChecked(taskKey(p, i)));
      if (!allDone) {
        set.add(p.weeks);
        break;
      }
    }
    if (set.size === 0 && phases[0]) set.add(phases[0].weeks);
    return set;
    // We only want to compute the initial expansion once per mount per idea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea.id]);
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  function toggleExpanded(weeks: string) {
    setExpanded((s) => {
      const s2 = new Set(s);
      if (s2.has(weeks)) s2.delete(weeks);
      else s2.add(weeks);
      return s2;
    });
  }

  if (!plan || phases.length === 0) {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <StatusPill status={idea.status} />
          <span className="font-mono text-xs text-muted">{formatDate(idea.updated_at)}</span>
        </div>
        <h3 className="font-display text-2xl leading-tight mb-3">{idea.title}</h3>
        <p className="text-sm text-muted leading-relaxed">
          No execution plan attached. This idea was moved to in-progress without
          a 12-week plan.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <StatusPill status={idea.status} />
          <span className="font-mono text-xs text-muted">
            started {idea.plan_ready_at && formatDate(idea.plan_ready_at)} · {completedTasks}/{totalTasks} done
          </span>
        </div>
        <h3 className="font-display text-3xl leading-tight mb-5">{idea.title}</h3>

        {hasOrphanChecks && !bannerDismissed && (
          <div className="mb-5 px-4 py-2.5 rounded-md border border-info/40 bg-info/5 flex items-start justify-between gap-3">
            <p className="text-sm text-info leading-relaxed">
              Plan updated since you last checked off tasks. Previous progress
              reset.
            </p>
            <button
              onClick={() => setBannerDismissed(true)}
              className="font-mono text-xs text-info/80 hover:text-info"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 text-xs text-error font-mono">{error}</div>
        )}

        <div className="space-y-3">
          {phases.map((phase) => {
            const tasks = phase.tasks ?? [];
            const phaseChecked = tasks.filter((_, i) => isChecked(taskKey(phase, i))).length;
            const isExpanded = expanded.has(phase.weeks);
            const phaseDone = tasks.length > 0 && phaseChecked === tasks.length;
            const isActive = !phaseDone;
            return (
              <div key={phase.weeks} className={`border-t pt-3 first:border-t-0 first:pt-0 ${phaseDone ? "border-success/20" : "border-border"}`}>
                <button
                  onClick={() => toggleExpanded(phase.weeks)}
                  className="w-full flex items-center justify-between gap-3 py-1 text-left"
                  aria-expanded={isExpanded}
                >
                  <h4 className={`font-display text-base sm:text-lg leading-tight flex-1 min-w-0 ${phaseDone ? "text-text/60" : ""}`}>
                    <span className={`text-xs sm:text-sm font-mono mr-2 ${phaseDone ? "text-success/60" : "text-accent"}`}>Weeks {phase.weeks}</span>
                    {phase.title}
                  </h4>
                  <span
                    className={`font-mono text-xs whitespace-nowrap ${
                      phaseDone ? "text-success" : isActive ? "text-accent" : "text-muted"
                    }`}
                  >
                    {phaseChecked}/{tasks.length} done{phaseDone ? " ✓" : ""}
                  </span>
                  <span className="font-mono text-xs text-muted w-3 text-center" aria-hidden="true">
                    {isExpanded ? "▾" : "▸"}
                  </span>
                </button>
                {isExpanded && (
                  <ul className="mt-1 pl-1">
                    {tasks.map((raw, i) => {
                      const key = taskKey(phase, i);
                      const detail = normalizeTask(raw as any);
                      return (
                        <li key={key}>
                          <Checkbox
                            checked={isChecked(key)}
                            onChange={(next) => toggleTask(key, next)}
                            label={detail.task}
                            pending={pending.has(key)}
                          />
                          {detail.steps.length > 0 && (
                            <TaskSteps steps={detail.steps} />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      {celebration && (
        <CelebrationToast
          ideaTitle={idea.title}
          onUndo={undoLaunch}
          onDismiss={() => setCelebration(false)}
        />
      )}
    </>
  );
}

function TaskSteps({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`ml-7 ${open ? "mb-3" : "mb-1"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="font-mono text-[0.6875rem] text-accent/70 hover:text-accent"
      >
        {open ? "hide steps" : `${steps.length} steps`}
      </button>
      {open && (
        <ol className="mt-1.5 mb-2 space-y-2 border-l-2 border-accent/25 pl-4">
          {steps.map((s, i) => (
            <li key={i} className="text-sm text-text/80 leading-relaxed">
              <span className="font-mono text-[0.6875rem] text-accent/60 mr-1.5">{i + 1}.</span>
              {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
