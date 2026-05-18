"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea } from "@/lib/supabase";
import { StatusPill } from "./status-pill";

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
      <div className="flex gap-2 mb-4 items-center flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 text-sm rounded-sm border transition-colors ${
              filter === f.id
                ? "bg-text text-bg border-transparent"
                : "border-border text-text hover:bg-border/50"
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search titles…"
          className="ml-auto text-sm px-3 py-1.5 rounded-md border border-border bg-transparent focus:outline-none focus:border-accent"
        />
      </div>

      <div className="border border-border rounded-md overflow-hidden bg-surface">
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
                    className="text-accent hover:underline"
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
            className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-surface overflow-y-auto p-6 border-l border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(null)}
              className="text-sm text-muted hover:text-text mb-3"
            >
              Close ×
            </button>
            <div className="mb-3">
              <StatusPill status={open.status} />
            </div>
            <h3 className="font-display text-2xl leading-tight mb-3">{open.title}</h3>
            <p className="text-base text-text/90 leading-relaxed mb-4">{open.description}</p>
            <pre className="font-mono text-xs whitespace-pre-wrap bg-border/40 p-3 rounded-md overflow-x-auto">
              {JSON.stringify(open, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
