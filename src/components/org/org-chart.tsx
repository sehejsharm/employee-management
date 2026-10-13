"use client";

import * as React from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  Maximize2,
  Minus,
  Move,
  PencilRuler,
  Plus,
  Search,
  Target,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { DepartmentTag, deptColor } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { setManager, updatePlacement } from "@/actions/org";
import { buildForest, countDescendants, withAdditionalLines, wouldCreateCycle, type TreeNode } from "@/lib/org";
import { AdditionalManagersEditor } from "./additional-managers";
import { useSyncedState } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import "./org-tree.css";

export interface OrgPerson {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  roleLabel: string;
  role: string;
  status: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
  managerId: string | null;
  /** Anyone else they report to besides their main manager. */
  alsoReportsTo: string[];
  avatarHue: number;
  focus: string | null;
  orgOrder: number;
  employeeCode: string;
  department: { id: string; name: string; color: string } | null;
}

/** First names by id, so a card can say who else someone reports to. */
const NamesContext = React.createContext<Map<string, string>>(new Map());

const ROLE_RANK: Record<string, number> = { FOUNDER: 0, MANAGER: 1, EMPLOYEE: 2, INTERN: 3 };

export function OrgChart({
  people,
  departments,
  canEdit,
  meId,
}: {
  people: OrgPerson[];
  departments: { id: string; name: string; color: string }[];
  canEdit: boolean;
  meId: string;
}) {
  const [showFormer, setShowFormer] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [dept, setDept] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<OrgPerson | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [dragging, setDragging] = React.useState<OrgPerson | null>(null);
  const [local, setLocal] = useSyncedState(people);
  const names = React.useMemo(() => new Map(local.map((p) => [p.id, p.firstName])), [local]);

  const visible = React.useMemo(() => local.filter((p) => showFormer || p.status !== "INACTIVE"), [local, showFormer]);
  const forest = React.useMemo(
    () =>
      buildForest(visible, (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.orgOrder - b.orgOrder || a.firstName.localeCompare(b.firstName)),
    [visible],
  );

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      visible
        .filter((p) => `${p.firstName} ${p.lastName} ${p.title ?? ""} ${p.employeeCode}`.toLowerCase().includes(q))
        .map((p) => p.id),
    );
  }, [query, visible]);

  // While searching, branches holding a match are shown even if collapsed.
  const effectiveCollapsed = React.useMemo(() => {
    if (!matches || matches.size === 0) return collapsed;
    const parent = new Map(visible.map((p) => [p.id, p.managerId]));
    const next = new Set(collapsed);
    for (const id of matches) {
      let cur = parent.get(id);
      while (cur) {
        next.delete(cur);
        cur = parent.get(cur) ?? null;
      }
    }
    return next;
  }, [collapsed, matches, visible]);

  // Bring the first match into view.
  React.useEffect(() => {
    if (!matches || matches.size === 0) return;
    const first = [...matches][0];
    const t = window.setTimeout(() => {
      document.getElementById(`org-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [matches]);

  /* ----- zoom & pan ----- */
  const viewport = React.useRef<HTMLDivElement>(null);
  const content = React.useRef<HTMLDivElement>(null);
  const [natural, setNatural] = React.useState({ w: 0, h: 0 });
  const fitted = React.useRef(false);

  React.useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNatural({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = React.useCallback(() => {
    const vp = viewport.current;
    if (!vp || !natural.w) return;
    // Readability wins over seeing everything: never shrink cards below 60%.
    const z = Math.max(0.6, Math.min(1, (vp.clientWidth - 48) / natural.w));
    setZoom(Number(z.toFixed(2)));
    requestAnimationFrame(() => vp.scrollTo({ left: Math.max(0, (natural.w * z - vp.clientWidth) / 2), top: 0 }));
  }, [natural.w]);

  React.useEffect(() => {
    if (!fitted.current && natural.w) {
      fitted.current = true;
      fit();
    }
  }, [natural.w, fit]);

  const pan = React.useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || (e.target as HTMLElement).closest("[data-org-card],button,a,input")) return;
    const vp = viewport.current!;
    pan.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop };
    vp.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pan.current) return;
    const vp = viewport.current!;
    vp.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
    vp.scrollTop = pan.current.top - (e.clientY - pan.current.y);
  };
  const onPointerUp = () => (pan.current = null);

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => Math.max(0.35, Math.min(1.5, Number((z - e.deltaY * 0.0015).toFixed(2)))));
  };

  /* ----- editing ----- */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const move = async (personId: string, managerId: string | null) => {
    const person = local.find((p) => p.id === personId);
    if (!person || person.managerId === managerId) return;
    if (wouldCreateCycle(allLines(local), personId, managerId)) {
      toast.error("That would make someone report to their own report.");
      return;
    }
    const before = local;
    // Becoming the main manager replaces being an additional one.
    setLocal((list) => list.map((p) => (p.id === personId ? { ...p, managerId, alsoReportsTo: p.alsoReportsTo.filter((m) => m !== managerId) } : p)));
    const res = await setManager(personId, managerId);
    if (!res.ok) {
      setLocal(before);
      toast.error(res.error);
    } else {
      toast.success(res.message);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (!e.over) return;
    const target = String(e.over.id);
    move(String(e.active.id), target === "__root__" ? null : target.replace(/^drop-/, ""));
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allWithReports = visible.filter((p) => visible.some((c) => c.managerId === p.id)).map((p) => p.id);

  const chart = (
    <div className="org-tree inline-block min-w-full px-6 py-8">
      <ul>
        {forest.map((node) => (
          <Branch
            key={node.item.id}
            node={node}
            collapsed={effectiveCollapsed}
            onToggle={toggle}
            onSelect={setSelected}
            matches={matches}
            dept={dept}
            editMode={editMode}
            meId={meId}
          />
        ))}
      </ul>
    </div>
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find someone…"
            className="h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-8 text-base shadow-xs sm:text-[13.5px] outline-none placeholder:text-fg-subtle focus:border-brand focus:ring-4 focus:ring-ring/40"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2 text-fg-subtle hover:text-fg" aria-label="Clear">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-1 lg:px-0">
          {departments.map((d) => {
            const c = deptColor(d.color);
            const on = dept === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setDept(on ? null : d.id)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition",
                  on ? "border-brand/40 bg-brand-soft text-fg" : "border-line bg-surface text-fg-muted hover:text-fg",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                {d.name}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] text-fg-muted">
            <Switch checked={showFormer} onCheckedChange={setShowFormer} /> Former
          </label>
          {canEdit && (
            <Button variant={editMode ? "primary" : "secondary"} size="sm" onClick={() => setEditMode((m) => !m)}>
              <PencilRuler /> {editMode ? "Done editing" : "Edit hierarchy"}
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {editMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-brand/25 bg-brand-soft px-4 py-3 text-[13px] text-brand-soft-fg">
              <Move className="size-4 shrink-0" />
              Drag a person onto their new manager. Drop on the strip at the top to make them top-level. Click anyone to change their title,
              department or status.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-sunken/50 shadow-sm">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(90%_80%_at_50%_30%,var(--brand),transparent)]" />
        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-xl border border-line bg-surface/90 p-1 shadow-md backdrop-blur">
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.max(0.35, Number((z - 0.1).toFixed(2))))} aria-label="Zoom out">
            <Minus />
          </Button>
          <span className="w-11 text-center text-xs font-medium tabular text-fg-muted">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))} aria-label="Zoom in">
            <Plus />
          </Button>
          <span className="mx-0.5 h-5 w-px bg-line" />
          <Button variant="ghost" size="icon-sm" onClick={fit} aria-label="Fit to screen">
            <Maximize2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed((c) => (c.size ? new Set() : new Set(allWithReports)))}
            aria-label={collapsed.size ? "Expand all" : "Collapse all"}
          >
            {collapsed.size ? <ChevronsUpDown /> : <ChevronsDownUp />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => document.getElementById(`org-${meId}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" })}
            aria-label="Find me"
          >
            <Target />
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={(e) => setDragging(local.find((p) => p.id === e.active.id) ?? null)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          {editMode && <RootDropZone />}
          <div
            ref={viewport}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            className={cn("relative h-[calc(100dvh-300px)] min-h-[480px] overflow-auto", !editMode && "cursor-grab active:cursor-grabbing")}
          >
            <div style={{ width: natural.w * zoom || undefined, height: natural.h * zoom || undefined }} className="mx-auto">
              <div ref={content} style={{ transform: `scale(${zoom})`, transformOrigin: "0 0" }} className="w-max">
                <NamesContext.Provider value={names}>{chart}</NamesContext.Provider>
              </div>
            </div>
          </div>
          <DragOverlay dropAnimation={null}>{dragging ? <NodeCard person={dragging} reports={0} overlay /> : null}</DragOverlay>
        </DndContext>
      </div>

      <PersonSheet
        key={selected?.id ?? "none"}
        person={selected ? (local.find((p) => p.id === selected.id) ?? selected) : null}
        people={local}
        departments={departments}
        canEdit={canEdit}
        onClose={() => setSelected(null)}
        onSaved={(p) => setLocal((list) => list.map((x) => (x.id === p.id ? p : x)))}
      />
    </div>
  );
}

function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: "__root__" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative z-10 m-3 flex h-11 items-center justify-center rounded-xl border-2 border-dashed text-[12.5px] font-medium transition",
        isOver ? "border-brand bg-brand-soft text-brand-soft-fg" : "border-line-strong text-fg-subtle",
      )}
    >
      Drop here to make someone top-level
    </div>
  );
}

function Branch({
  node,
  collapsed,
  onToggle,
  onSelect,
  matches,
  dept,
  editMode,
  meId,
}: {
  node: TreeNode<OrgPerson>;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (p: OrgPerson) => void;
  matches: Set<string> | null;
  dept: string | null;
  editMode: boolean;
  meId: string;
}) {
  const p = node.item;
  const isCollapsed = collapsed.has(p.id);
  const dim = (matches && !matches.has(p.id)) || (dept && p.department?.id !== dept);
  const highlight = matches?.has(p.id);
  const reports = countDescendants(node);

  return (
    <li>
      <EditableNode
        person={p}
        editMode={editMode}
        dim={!!dim}
        highlight={!!highlight}
        isMe={p.id === meId}
        reports={node.children.length}
        totalReports={reports}
        collapsed={isCollapsed}
        onToggle={() => onToggle(p.id)}
        onSelect={() => onSelect(p)}
      />
      {node.children.length > 0 && !isCollapsed && (
        <ul>
          {node.children.map((child) => (
            <Branch
              key={child.item.id}
              node={child}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
              matches={matches}
              dept={dept}
              editMode={editMode}
              meId={meId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function EditableNode({
  person,
  editMode,
  dim,
  highlight,
  isMe,
  reports,
  totalReports,
  collapsed,
  onToggle,
  onSelect,
}: {
  person: OrgPerson;
  editMode: boolean;
  dim: boolean;
  highlight: boolean;
  isMe: boolean;
  reports: number;
  totalReports: number;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const { setNodeRef: setDragRef, attributes, listeners, isDragging } = useDraggable({ id: person.id, disabled: !editMode });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop-${person.id}`, disabled: !editMode });
  const names = React.useContext(NamesContext);
  const alsoReportsTo = person.alsoReportsTo.map((id) => names.get(id)).filter((n): n is string => !!n);
  return (
    <div ref={setDropRef} className="relative flex flex-col items-center">
      <div ref={setDragRef} className={cn(isDragging && "opacity-30")}>
        <NodeCard
          person={person}
          alsoReportsTo={alsoReportsTo}
          reports={reports}
          dim={dim}
          highlight={highlight}
          isMe={isMe}
          dropTarget={isOver && !isDragging}
          editMode={editMode}
          onClick={onSelect}
          handleProps={editMode ? { ...attributes, ...listeners } : undefined}
        />
      </div>
      {reports > 0 && (
        <button
          onClick={onToggle}
          className="relative z-10 -mt-3 inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-fg-muted shadow-xs transition hover:border-brand/40 hover:text-brand"
          aria-label={collapsed ? "Show reports" : "Hide reports"}
        >
          {totalReports}
          <ChevronDown className={cn("size-3 transition-transform", collapsed && "-rotate-90")} />
        </button>
      )}
    </div>
  );
}

function NodeCard({
  person,
  alsoReportsTo,
  reports,
  dim,
  highlight,
  isMe,
  dropTarget,
  editMode,
  overlay,
  onClick,
  handleProps,
}: {
  person: OrgPerson;
  /** First names of their additional bosses. */
  alsoReportsTo?: string[];
  reports: number;
  dim?: boolean;
  highlight?: boolean;
  isMe?: boolean;
  dropTarget?: boolean;
  editMode?: boolean;
  overlay?: boolean;
  onClick?: () => void;
  handleProps?: Record<string, unknown>;
}) {
  const c = deptColor(person.department?.color);
  const former = person.status === "INACTIVE";
  return (
    <motion.div
      id={`org-${person.id}`}
      data-org-card
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: dim ? 0.35 : 1, y: 0, scale: dropTarget ? 1.04 : 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className={cn(
        "group relative w-[220px] cursor-pointer overflow-hidden rounded-2xl border bg-surface text-left shadow-sm transition-shadow hover:shadow-md",
        highlight ? "border-brand ring-4 ring-brand/20" : dropTarget ? "border-brand ring-4 ring-brand/25" : "border-line",
        isMe && !highlight && "ring-2 ring-brand/30",
        overlay && "rotate-2 shadow-lg ring-2 ring-brand/40",
        former && "bg-surface-sunken",
      )}
    >
      <div className={cn("h-1 w-full bg-gradient-to-r", c.bar, former && "opacity-40")} />
      <div className="flex items-start gap-3 p-3.5">
        <Avatar person={person} size="md" dimmed={former} />
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-[13.5px] font-semibold", former && "text-fg-muted")}>
            {person.firstName} {person.lastName}
          </div>
          <div className="truncate text-xs text-fg-muted">{person.title ?? person.roleLabel}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {person.status === "ON_LEAVE" && (
              <span className="rounded-full bg-warning-soft px-1.5 py-px text-[10px] font-semibold text-warning">On leave</span>
            )}
            {former && <span className="rounded-full bg-surface px-1.5 py-px text-[10px] font-semibold text-fg-subtle ring-1 ring-line">Former</span>}
            {person.department && (
              <span className={cn("truncate text-[10.5px] font-medium", c.text)}>{person.department.name}</span>
            )}
          </div>
        </div>
        {editMode && handleProps && (
          <span
            {...handleProps}
            onClick={(e) => e.stopPropagation()}
            className="-mr-1 cursor-grab touch-none rounded-md p-1 text-fg-subtle hover:bg-surface-hover active:cursor-grabbing"
            aria-label={`Drag ${person.firstName}`}
          >
            <GripVertical className="size-4" />
          </span>
        )}
      </div>
      {alsoReportsTo && alsoReportsTo.length > 0 && !former && (
        <div className="truncate border-t border-dashed border-line px-3.5 py-1.5 text-[11px] text-fg-muted" title={`Also reports to ${alsoReportsTo.join(", ")}`}>
          <span className="font-medium text-brand">Also reports to</span> {alsoReportsTo.join(", ")}
        </div>
      )}
      {person.focus && !former && (
        <div className="border-t border-line bg-surface-sunken/50 px-3.5 py-2 text-[11px] leading-snug text-fg-muted">
          <span className="line-clamp-2">
            <Target className="mr-1 inline size-3 text-brand" />
            {person.focus}
          </span>
        </div>
      )}
      {reports > 0 && <span className="sr-only">{reports} direct reports</span>}
    </motion.div>
  );
}

function PersonSheet({
  person,
  people,
  departments,
  canEdit,
  onClose,
  onSaved,
}: {
  person: OrgPerson | null;
  people: OrgPerson[];
  departments: { id: string; name: string; color: string }[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: (p: OrgPerson) => void;
}) {
  // Keyed by person in the parent, so these start fresh for each person opened.
  const [title, setTitle] = React.useState(person?.title ?? "");
  const [departmentId, setDepartmentId] = React.useState<string>(person?.department?.id ?? "");
  const [managerId, setManagerId] = React.useState<string>(person?.managerId ?? "");
  const [status, setStatus] = React.useState<OrgPerson["status"]>(person?.status ?? "ACTIVE");
  const [pending, start] = React.useTransition();

  if (!person) return <Dialog open={false} />;

  const manager = people.find((p) => p.id === person.managerId);
  const otherBosses = person.alsoReportsTo.map((id) => people.find((p) => p.id === id)).filter((p): p is OrgPerson => !!p);
  const reports = people.filter((p) => (p.managerId === person.id || p.alsoReportsTo.includes(person.id)) && p.status !== "INACTIVE");
  const lines = allLines(people);
  const managerOptions = people.filter((p) => p.status !== "INACTIVE" && !wouldCreateCycle(lines, person.id, p.id));
  const extraBossOptions = managerOptions.filter((p) => p.id !== person.id && p.id !== person.managerId && !person.alsoReportsTo.includes(p.id));

  const save = () =>
    start(async () => {
      const res = await updatePlacement(person.id, {
        title,
        departmentId: departmentId || null,
        managerId: managerId || null,
        status,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${person.firstName}'s placement saved.`);
      const department = departments.find((d) => d.id === departmentId) ?? null;
      onSaved({ ...person, title: title || null, department, managerId: managerId || null, status });
      onClose();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <SheetContent title={`${person.firstName} ${person.lastName}`} description={`${person.title ?? person.roleLabel} · ${person.employeeCode}`}>
        <div className="flex items-center gap-4">
          <Avatar person={person} size="lg" />
          <div className="min-w-0">
            {person.department && <DepartmentTag name={person.department.name} color={person.department.color} />}
            <div className="mt-1 text-[13px] text-fg-muted">
              {manager ? (
                <>
                  Reports to <span className="font-medium text-fg">{manager.firstName} {manager.lastName}</span>
                  {otherBosses.length > 0 && (
                    <>
                      {" "}and <span className="font-medium text-fg">{otherBosses.map((b) => `${b.firstName} ${b.lastName}`).join(", ")}</span>
                    </>
                  )}
                </>
              ) : otherBosses.length ? (
                <>
                  Reports to <span className="font-medium text-fg">{otherBosses.map((b) => `${b.firstName} ${b.lastName}`).join(", ")}</span>
                </>
              ) : (
                "Top level"
              )}
            </div>
            <div className="text-[13px] text-fg-muted">
              {reports.length} direct report{reports.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        {person.focus && (
          <div className="mt-4 rounded-xl border border-line bg-surface-sunken/60 p-3 text-[13px]">
            <span className="text-fg-subtle">Focused on </span>
            {person.focus}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Button asChild variant="secondary" size="sm" className="flex-1">
            <Link href={`/people/${person.id}`}>View profile</Link>
          </Button>
          <Button asChild variant="soft" size="sm" className="flex-1">
            <Link href={`/tasks/new?for=${person.id}`}>Assign a task</Link>
          </Button>
        </div>

        {canEdit && (
          <div className="mt-6 space-y-4 border-t border-line pt-5">
            <div className="text-[13px] font-semibold">Placement</div>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Marketing Associate" />
            </Field>
            <Field label="Department">
              <NativeSelect value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Reports to">
              <NativeSelect value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">No one (top level)</option>
                {managerOptions
                  .filter((p) => p.id !== person.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName} — {p.title ?? p.roleLabel}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Also reports to" hint="A second (or third) boss. They see this person as their report; the main manager decides where they sit on the chart.">
              <AdditionalManagersEditor
                personId={person.id}
                personFirstName={person.firstName}
                current={otherBosses}
                candidates={extraBossOptions}
              />
            </Field>
            <Field label="Status" hint="Former members can't sign in. Their history stays.">
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["ACTIVE", "Working"],
                    ["ON_LEAVE", "On leave"],
                    ["INACTIVE", "Former"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatus(value)}
                    className={cn(
                      "h-9 rounded-[10px] border text-[13px] font-medium transition",
                      status === value
                        ? value === "INACTIVE"
                          ? "border-danger/40 bg-danger-soft text-danger"
                          : value === "ON_LEAVE"
                            ? "border-warning/40 bg-warning-soft text-warning"
                            : "border-success/40 bg-success-soft text-success"
                        : "border-line text-fg-muted hover:border-line-strong",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <Button className="w-full" onClick={save} loading={pending}>
              Save placement
            </Button>
          </div>
        )}
      </SheetContent>
    </Dialog>
  );
}

/** Every reporting line on the chart — main managers plus additional bosses — for loop checks. */
function allLines(people: OrgPerson[]) {
  return withAdditionalLines(
    people,
    people.flatMap((p) => p.alsoReportsTo.map((managerId) => ({ userId: p.id, managerId }))),
  );
}
