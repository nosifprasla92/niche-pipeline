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
  new: "bg-border text-info",
  pursuing: "bg-border text-warning",
  researched: "bg-border text-warning",
  planning: "bg-border text-success",
  plan_ready: "bg-border text-success",
  in_progress: "bg-border text-accent",
  launched: "bg-border text-success",
  passed: "bg-border text-muted",
};

export function formatDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
