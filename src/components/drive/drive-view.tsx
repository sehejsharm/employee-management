"use client";

import * as React from "react";
import Link from "next/link";
import { Download, ExternalLink, FileText, Link2, NotebookPen, Search, StickyNote } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBytes, cn } from "@/lib/utils";
import { formatDate } from "@/lib/time";
import type { DriveItem, DriveKind } from "@/lib/drive";

const FILTERS: { key: "ALL" | DriveKind; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "FILE", label: "Documents" },
  { key: "LINK", label: "Links" },
  { key: "WRITEUP", label: "Write-ups" },
  { key: "NOTE", label: "Notes" },
];

const ICON: Record<DriveKind, React.ElementType> = { FILE: FileText, LINK: Link2, NOTE: StickyNote, WRITEUP: NotebookPen };

const PROOF: Record<NonNullable<DriveItem["proof"]>, { label: string; className: string }> = {
  ACCEPTED: { label: "Accepted", className: "bg-success-soft text-success" },
  SUBMITTED: { label: "In review", className: "bg-info-soft text-info" },
  CHANGES_REQUESTED: { label: "Sent back", className: "bg-warning-soft text-warning" },
};

function month(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "long", year: "numeric" }).format(new Date(iso));
}

/** Someone's drive: everything they've handed in or added to tasks, newest first. */
export function DriveView({ items, tz }: { items: DriveItem[]; tz: string }) {
  const [filter, setFilter] = React.useState<"ALL" | DriveKind>("ALL");
  const [query, setQuery] = React.useState("");
  const [proofOnly, setProofOnly] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      (filter === "ALL" || i.kind === filter) &&
      (!proofOnly || i.proof) &&
      (!q || [i.title, i.fileName, i.text, i.href, i.task.title, `t-${i.task.number}`].some((v) => v?.toLowerCase().includes(q))),
  );
  const groups = new Map<string, DriveItem[]>();
  for (const i of shown) {
    const m = month(i.createdAt, tz);
    groups.set(m, [...(groups.get(m) ?? []), i]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, task or T-number"
            aria-label="Search the drive"
            className="h-10 w-full min-w-0 rounded-xl border border-line bg-surface pl-9 pr-3 text-base shadow-xs outline-none transition focus:border-brand focus:ring-4 focus:ring-ring/40 sm:text-sm"
          />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] text-fg-muted">
          <input type="checkbox" checked={proofOnly} onChange={(e) => setProofOnly(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Handed-in proof only
        </label>
      </div>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {FILTERS.map((f) => {
          const count = f.key === "ALL" ? items.length : items.filter((i) => i.kind === f.key).length;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition",
                filter === f.key ? "border-brand/30 bg-brand-soft text-brand-soft-fg" : "border-line bg-surface text-fg-muted hover:text-fg",
              )}
            >
              {f.label} <span className="text-fg-subtle">{count}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={items.length ? "Nothing matches" : "Nothing here yet"}
          description={items.length ? "Try another filter or search." : "Documents, links and write-ups handed in for tasks collect here — and stay, even after the work is accepted."}
        />
      ) : (
        [...groups].map(([label, list]) => (
          <section key={label}>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              {list.map((i) => {
                const Icon = ICON[i.kind];
                const expandable = i.kind === "NOTE" || i.kind === "WRITEUP";
                return (
                  <li key={i.id} className="p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-fg-muted">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[14px] font-medium wrap-anywhere">{i.title}</span>
                          {i.proof && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", PROOF[i.proof].className)}>{PROOF[i.proof].label}</span>}
                          {!i.proof && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-fg-muted">Task material</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[12.5px] text-fg-muted">
                          <Link href={`/tasks/${i.task.id}`} className="min-w-0 truncate hover:text-fg hover:underline">
                            T-{i.task.number} · {i.task.title}
                          </Link>
                          <span suppressHydrationWarning>· {formatDate(new Date(i.createdAt), tz)}</span>
                          {i.size ? <span>· {formatBytes(i.size)}</span> : null}
                          {i.task.archived && <span>· archived task</span>}
                        </div>
                        {expandable && open === i.id && (
                          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-sunken p-3 text-[13px] wrap-anywhere">{i.text}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {i.kind === "FILE" && i.href && (
                          <>
                            <a href={i.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-[13px] font-medium hover:bg-surface-hover">
                              <ExternalLink className="size-4" /> <span className="hidden sm:inline">Open</span>
                            </a>
                            <a href={`${i.href}?download=1`} aria-label={`Download ${i.fileName ?? i.title}`} className="inline-flex h-9 items-center rounded-xl border border-line px-2.5 hover:bg-surface-hover">
                              <Download className="size-4" />
                            </a>
                          </>
                        )}
                        {i.kind === "LINK" && i.href && (
                          <a href={i.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-[13px] font-medium hover:bg-surface-hover">
                            <ExternalLink className="size-4" /> <span className="hidden sm:inline">Open link</span>
                          </a>
                        )}
                        {expandable && (
                          <button
                            type="button"
                            onClick={() => setOpen(open === i.id ? null : i.id)}
                            aria-expanded={open === i.id}
                            className="inline-flex h-9 items-center rounded-xl border border-line px-3 text-[13px] font-medium hover:bg-surface-hover"
                          >
                            {open === i.id ? "Hide" : "Read"}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
