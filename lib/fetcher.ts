export const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

export const STATUS_LABEL: Record<string, string> = {
  new: "new",
  pursuing: "researching",
  researched: "researched",
  planning: "planning",
  plan_ready: "plan ready",
  in_progress: "in progress",
  launched: "launched",
  passed: "passed",
};

export const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  pursuing: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  researched: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  planning: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  plan_ready: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  in_progress: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  launched: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  passed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function formatDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
