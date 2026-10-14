"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, ChevronDown, Columns3, List, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { ClientTaskRow } from "@/lib/tasks/queries";
import { DUE_BUCKET_LABEL, dueBucket, type DueBucket } from "@/lib/time";
import { useSyncedState } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER, type TaskPriorityKey, type TaskStatusKey } from "./meta";
import { TaskRow } from "./task-row";
import { TaskBoard } from "./task-board";
import { TaskCalendar } from "./task-calendar";

type View = "list" | "board" | "calendar";

export interface Scope {
  key: string;
  label: string;
  count: number;
}

const BUCKET_ORDER: DueBucket[] = ["overdue", "today", "tomorrow", "week", "later", "review", "done"];

export function TasksView({
  tasks: initial,
  tz,
  userId,
  isFounder,
  scopes,
  scope,
  initialView,
}: {
  tasks: ClientTaskRow[];
  tz: string;
  userId: string;
  isFounder: boolean;
  scopes: Scope[];
  scope: string;
  initialView: View;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [tasks, setTasks] = useSyncedState(initial);
  const [view, setView] = React.useState<View>(initialView);
  const [query, setQuery] = React.useState("");
  const [statuses, setStatuses] = React.useState<Set<TaskStatusKey>>(new Set());
  const [priorities, setPriorities] = React.useState<Set<TaskPriorityKey>>(new Set());
  const [showDone, setShowDone] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);


  const changeView = (v: View) => {
    setView(v);
    const next = new URLSearchParams(params.toString());
    next.set("view", v);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const canChange = React.useCallback(
    (t: ClientTaskRow) => isFounder || t.createdById === userId || t.assignees.some((a) => a.id === userId),
    [isFounder, userId],
  );

  const updateLocal = React.useCallback((id: string, status: TaskStatusKey) => {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, status } : t)));
  }, [setTasks]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q) && !`t-${t.number}`.includes(q.replace(/\s/g, ""))) return false;
      if (statuses.size && !statuses.has(t.status)) return false;
      if (priorities.size && !priorities.has(t.priority)) return false;
      return true;
    });
  }, [tasks, query, statuses, priorities]);

  const groups = React.useMemo(() => {
    const now = new Date();
    const map = new Map<DueBucket, ClientTaskRow[]>();
    for (const t of filtered) {
      const b = dueBucket(new Date(t.dueAt), t.status, tz, now);
      map.set(b, [...(map.get(b) ?? []), t]);
    }
    for (const [b, list] of map) {
      list.sort((a, c) =>
        b === "done"
          ? new Date(c.dueAt).getTime() - new Date(a.dueAt).getTime()
          : new Date(a.dueAt).getTime() - new Date(c.dueAt).getTime() || PRIORITY_META[c.priority].weight - PRIORITY_META[a.priority].weight,
      );
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, tasks: map.get(b)! }));
  }, [filtered, tz]);

  const activeFilters = statuses.size + priorities.size;
  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div>
      {/* Scope tabs */}
      <div className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {scopes.map((s) => {
          const active = s.key === scope;
          const next = new URLSearchParams(params.toString());
          next.set("scope", s.key);
          return (
            <Link
              key={s.key}
              href={`${pathname}?${next.toString()}`}
              scroll={false}
              className={cn(
                "relative flex shrink-0 items-center gap-2 px-3 pb-3 pt-1 text-[13.5px] font-medium transition-colors",
                active ? "text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {s.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[11px] tabular",
                  active ? "bg-brand-soft text-brand-soft-fg" : "bg-surface-sunken text-fg-subtle",
                )}
              >
                {s.count}
              </span>
              {active && (
                <motion.span layoutId="scope-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title or T-number"
            className="h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-8 text-base shadow-xs sm:text-[13.5px] outline-none transition placeholder:text-fg-subtle focus:border-brand focus:ring-4 focus:ring-ring/40"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2 text-fg-subtle hover:text-fg" aria-label="Clear">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setFiltersOpen((o) => !o)} className={cn(activeFilters && "border-brand/40 text-brand")}>
            <SlidersHorizontal /> Filters
            {activeFilters > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] text-white">{activeFilters}</span>}
            <ChevronDown className={cn("transition-transform", filtersOpen && "rotate-180")} />
          </Button>
          {view === "list" && (
            <label className="hidden items-center gap-2 text-[13px] text-fg-muted sm:flex">
              <Switch checked={showDone} onCheckedChange={setShowDone} /> Completed
            </label>
          )}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Segmented
            layoutId="task-view"
            value={view}
            onChange={changeView}
            options={[
              { value: "list", label: "List", icon: <List /> },
              { value: "board", label: "Board", icon: <Columns3 /> },
              { value: "calendar", label: "Calendar", icon: <CalendarDays /> },
            ]}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-start sm:gap-8">
              <FilterGroup label="Status">
                {STATUS_ORDER.map((s) => {
                  const m = STATUS_META[s];
                  return (
                    <Chip key={s} active={statuses.has(s)} onClick={() => setStatuses((set) => toggle(set, s))}>
                      <m.icon className={cn("size-3.5", m.iconClass)} /> {m.label}
                    </Chip>
                  );
                })}
              </FilterGroup>
              <FilterGroup label="Priority">
                {PRIORITY_ORDER.map((p) => {
                  const m = PRIORITY_META[p];
                  return (
                    <Chip key={p} active={priorities.has(p)} onClick={() => setPriorities((set) => toggle(set, p))}>
                      <m.icon className={cn("size-3.5", m.className)} /> {m.label}
                    </Chip>
                  );
                })}
              </FilterGroup>
              {activeFilters > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="self-start sm:ml-auto"
                  onClick={() => {
                    setStatuses(new Set());
                    setPriorities(new Set());
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50">
          <EmptyState
            icon={<CalendarDays />}
            title={tasks.length === 0 ? "No tasks here yet" : "Nothing matches these filters"}
            description={
              tasks.length === 0
                ? "When work is assigned, it shows up here with its deadline."
                : "Try clearing a filter or searching for something else."
            }
            action={
              tasks.length === 0 ? (
                <Button asChild>
                  <Link href="/tasks/new">
                    <Plus /> Create a task
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : view === "board" ? (
        <TaskBoard tasks={filtered} tz={tz} canChange={canChange} onMove={updateLocal} />
      ) : view === "calendar" ? (
        <TaskCalendar tasks={filtered} tz={tz} />
      ) : (
        <div className="space-y-6">
          {groups
            .filter((g) => g.bucket !== "done" || showDone || statuses.has("DONE"))
            .map((g) => (
              <section key={g.bucket}>
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      g.bucket === "overdue" ? "bg-danger" : g.bucket === "today" ? "bg-warning" : g.bucket === "done" ? "bg-success" : "bg-brand",
                    )}
                  />
                  <h2 className={cn("text-[12.5px] font-semibold uppercase tracking-wider", g.bucket === "overdue" ? "text-danger" : "text-fg-muted")}>
                    {DUE_BUCKET_LABEL[g.bucket]}
                  </h2>
                  <span className="text-xs text-fg-subtle tabular">{g.tasks.length}</span>
                </div>
                <ul className="divide-y divide-line/70 rounded-2xl border border-line bg-surface p-1 shadow-sm">
                  <AnimatePresence initial={false}>
                    {g.tasks.map((t, i) => (
                      <TaskRow key={t.id} task={t} tz={tz} index={i} canChangeStatus={canChange(t)} onStatusChange={(s) => updateLocal(t.id, s)} />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          {!showDone && !statuses.has("DONE") && groups.some((g) => g.bucket === "done") && (
            <button
              onClick={() => setShowDone(true)}
              className="w-full rounded-xl border border-dashed border-line-strong py-3 text-[13px] font-medium text-fg-muted transition hover:border-brand/40 hover:text-brand"
            >
              Show {groups.find((g) => g.bucket === "done")!.tasks.length} completed
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition",
        active ? "border-brand/40 bg-brand-soft text-brand-soft-fg" : "border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
