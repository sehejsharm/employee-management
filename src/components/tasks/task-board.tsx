"use client";

import * as React from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { motion } from "motion/react";
import { MessageCircleQuestion, MessageSquare, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { AvatarStack } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-ring";
import { setTaskStatus } from "@/actions/tasks";
import type { ClientTaskRow } from "@/lib/tasks/queries";
import { cn } from "@/lib/utils";
import { DuePill, PriorityIcon } from "./badges";
import { PRIORITY_META, STATUS_META, STATUS_ORDER, type TaskStatusKey } from "./meta";

/**
 * Kanban by status. Drag a card to another column to move it — works with a
 * mouse, a finger (press and hold) or the keyboard (space, arrows, space).
 */
export function TaskBoard({
  tasks,
  tz,
  canChange,
  onMove,
}: {
  tasks: ClientTaskRow[];
  tz: string;
  canChange: (t: ClientTaskRow) => boolean;
  onMove: (id: string, status: TaskStatusKey) => void;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const columns = STATUS_ORDER.map((status) => ({
    status,
    tasks: tasks
      .filter((t) => t.status === status)
      .sort(
        (a, b) =>
          PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight ||
          new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
      ),
  }));

  const active = tasks.find((t) => t.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const to = e.over?.id as TaskStatusKey | undefined;
    const task = tasks.find((t) => t.id === id);
    if (!task || !to || task.status === to) return;
    if (!canChange(task)) {
      toast.error("Only the task's owner or assignees can move it.");
      return;
    }
    // Work reaches review by being submitted with proof, not by being dragged there.
    if (to === "IN_REVIEW") {
      toast.info(`Open T-${task.number} and use Submit work — it needs a document, a write-up or a link.`);
      return;
    }
    const from = task.status;
    onMove(id, to);
    const res = await setTaskStatus(id, to);
    if (!res.ok) {
      onMove(id, from);
      toast.error(res.error);
    } else if (to === "DONE") {
      toast.success(`Work accepted — T-${task.number} is done.`);
    }
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible">
        {columns.map((col) => (
          <Column key={col.status} status={col.status} count={col.tasks.length}>
            {col.tasks.map((t) => (
              <DraggableCard key={t.id} task={t} tz={tz} disabled={!canChange(t)} hidden={t.id === activeId} />
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
        {active ? <Card task={active} tz={tz} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ status, count, children }: { status: TaskStatusKey; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const m = STATUS_META[status];
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[78vw] max-w-[320px] shrink-0 snap-start flex-col rounded-2xl border border-line bg-surface-sunken/60 p-2 transition-colors sm:w-[300px] lg:w-auto lg:max-w-none",
        isOver && "border-brand/50 bg-brand-soft",
      )}
    >
      <div className="flex items-center gap-2 px-2 pb-2.5 pt-1.5">
        <m.icon className={cn("size-4", m.iconClass)} />
        <span className="text-[13px] font-semibold">{m.label}</span>
        <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-fg-subtle tabular ring-1 ring-line">{count}</span>
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function DraggableCard({ task, tz, disabled, hidden }: { task: ClientTaskRow; tz: string; disabled: boolean; hidden: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id, disabled });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-manipulation outline-none", hidden && "opacity-30")}>
      <Card task={task} tz={tz} />
    </div>
  );
}

function Card({ task, tz, dragging }: { task: ClientTaskRow; tz: string; dragging?: boolean }) {
  return (
    <motion.div
      layout
      className={cn(
        "group relative rounded-xl border border-line bg-surface p-3 shadow-xs transition-shadow hover:shadow-md",
        dragging && "rotate-[1.5deg] cursor-grabbing shadow-lg ring-2 ring-brand/30",
      )}
    >
      <div className="flex items-start gap-2">
        <Link
          href={`/tasks/${task.id}`}
          className="line-clamp-2 min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-fg wrap-anywhere after:absolute after:inset-0"
          draggable={false}
        >
          {task.title}
        </Link>
        <PriorityIcon priority={task.priority} className="mt-0.5" />
      </div>
      <div className="mt-1 font-mono text-[11px] text-fg-subtle">T-{task.number}</div>
      {task.progress > 0 && task.status !== "DONE" && <ProgressBar value={task.progress} className="mt-3" />}
      <div className="mt-3 flex items-center justify-between gap-2">
        <DuePill dueAt={task.dueAt} status={task.status} tz={tz} />
        <div className="flex items-center gap-2 text-fg-subtle">
          {task.awaitingUpdate && <MessageCircleQuestion className="size-3.5 text-info" aria-label="Update requested" />}
          {task.attachments > 0 && <Paperclip className="size-3.5" />}
          {task.comments > 0 && <MessageSquare className="size-3.5" />}
          <AvatarStack people={task.assignees} max={2} size="xs" />
        </div>
      </div>
    </motion.div>
  );
}
