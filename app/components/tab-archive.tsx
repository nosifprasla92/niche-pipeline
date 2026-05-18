"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { fetcher, formatDate } from "@/lib/fetcher";
import { Idea } from "@/lib/supabase";
import { StatusPill } from "./status-pill";

const FILTERS = [
  { id: "all", label: "All", match: () => true },
  { id: "passed", label: "Passed", match: (i: Idea) => i.status === "passed" },
  { id: "launched", label: "Launched", match: (i: Idea) => i.status === "launched" },
  { id: "in_progress", label: "In progress", match: (i: Idea) => i.status === "in_progress" },
];

export function TabArchive() {
  const { data } = useSWR<{ ideas: Idea[] }>(
    "/api/ideas?status=passed,launched,in_progress",
    fetcher,
    { refreshInterval: 30000 },
  );
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Idea | null>(null);

  const ideas = data?.ideas ?? [];
  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) ?? FILTERS[0];
    return ideas
      .filter(f.match)
      .filter((i) => i.title.toLowerCase().includes(search.toLowerCase()));
  }, [ideas, filter, search]);

  return (
    <div>
      <div className="flex gap-2 mb-3 items-center flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 text-sm rounded-full border ${
              filter === f.id
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search titles…"
          className="ml-auto text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
        />
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((idea) => (
              <tr
                key={idea.id}
                className="border-t border-zinc-200 dark:border-zinc-800"
              >
                <td className="px-3 py-2">{idea.title}</td>
                <td className="px-3 py-2">
                  <StatusPill status={idea.status} />
                </td>
                <td className="px-3 py-2 text-zinc-500">{formatDate(idea.updated_at)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setOpen(idea)}
                    className="text-blue-600 hover:underline"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
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
            className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-white dark:bg-zinc-950 overflow-y-auto p-6 border-l border-zinc-200 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(null)}
              className="text-sm text-zinc-500 mb-3"
            >
              Close ×
            </button>
            <div className="mb-3">
              <StatusPill status={open.status} />
            </div>
            <h3 className="text-xl font-semibold mb-2">{open.title}</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">{open.description}</p>
            <pre className="text-xs whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-900 p-3 rounded-md overflow-x-auto">
              {JSON.stringify(open, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
