"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { MessageCircleQuestion, MessageSquare, Paperclip } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Tooltip } from "@/components/ui/menu";
import type { ClientTaskRow } from "@/lib/tasks/queries";
import { cn } from "@/lib/utils";
import { DueLabel, PriorityIcon } from "./badges";
import { STATUS_META } from "./meta";
import { StatusMenu } from "./status-menu";

export function TaskRow({
  task,
  tz,
  canChangeStatus,
  index = 0,
  onStatusChange,
}: {
  task: ClientTaskRow;
  tz: string;
  canChangeStatus: boolean;
  index?: number;
  onStatusChange?: (status: ClientTaskRow["status"]) => void;
}) {
  const done = task.status === "DONE";
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 12) * 0.025 }}
      className="group relative @container"
    >
      <div className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors group-hover:bg-surface-hover @md:px-4">
        <div className="relative z-10">
        <StatusMenu taskId={task.id} status={task.status} disabled={!canChangeStatus} onChange={onStatusChange}>
          {(s, pending) => {
            const m = STATUS_META[s];
            return (
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-surface-sunken pointer-fine:h-7 pointer-fine:w-7",
                  pending && "animate-pulse",
                )}
                aria-label={`Status: ${m.label}`}
              >
                <m.icon className={cn("size-[18px]", m.iconClass)} />
              </span>
            );
          }}
        </StatusMenu>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="hidden shrink-0 whitespace-nowrap font-mono text-[11.5px] text-fg-subtle @xl:inline">T-{task.number}</span>
            <Link
              href={`/tasks/${task.id}`}
              className={cn(
                "truncate text-[14px] font-medium text-fg outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-brand",
                done && "text-fg-subtle line-through decoration-fg-subtle/50",
              )}
            >
              {task.title}
            </Link>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 @xl:hidden">
            <DueLabel dueAt={task.dueAt} status={task.status} tz={tz} className="text-[11.5px]" />
            <span className="font-mono text-[11px] text-fg-subtle">T-{task.number}</span>
          </div>
        </div>

        {task.awaitingUpdate && (
          <Tooltip content="An update has been requested">
            <span className="relative z-10 hidden h-6 items-center gap-1 rounded-full bg-info-soft px-2 text-[11px] font-medium text-info @3xl:inline-flex">
              <MessageCircleQuestion className="size-3.5" /> Update asked
            </span>
          </Tooltip>
        )}

        <div className="hidden items-center gap-2.5 text-fg-subtle @2xl:flex">
          {task.attachments > 0 && (
            <span className="inline-flex items-center gap-1 text-xs">
              <Paperclip className="size-3.5" />
              {task.attachments}
            </span>
          )}
          {task.comments > 0 && (
            <span className="inline-flex items-center gap-1 text-xs">
              <MessageSquare className="size-3.5" />
              {task.comments}
            </span>
          )}
        </div>

        <PriorityIcon priority={task.priority} className="hidden @lg:block" />

        {task.progress > 0 && !done && (
          <ProgressRing value={task.progress} size={26} stroke={3} label={false} className="hidden @2xl:inline-flex" />
        )}

        <div className="hidden w-[150px] shrink-0 justify-end @xl:flex">
          <DueLabel dueAt={task.dueAt} status={task.status} tz={tz} />
        </div>

        <AvatarStack people={task.assignees} max={3} size="sm" className="shrink-0" />
      </div>
    </motion.li>
  );
}
