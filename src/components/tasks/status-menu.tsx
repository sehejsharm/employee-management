"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { setTaskStatus } from "@/actions/tasks";
import { useSyncedState } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { STATUS_META, STATUS_ORDER, type TaskStatusKey } from "./meta";

/**
 * Changes a task's status from anywhere it's shown. Optimistic: the new status
 * appears immediately and rolls back if the server refuses.
 */
export function StatusMenu({
  taskId,
  status,
  disabled,
  children,
  onChange,
}: {
  taskId: string;
  status: TaskStatusKey;
  disabled?: boolean;
  children: (status: TaskStatusKey, pending: boolean) => React.ReactNode;
  onChange?: (status: TaskStatusKey) => void;
}) {
  const [optimistic, setOptimistic] = useSyncedState(status);
  const [pending, start] = React.useTransition();

  const choose = (next: TaskStatusKey) => {
    if (next === optimistic) return;
    const prev = optimistic;
    setOptimistic(next);
    onChange?.(next);
    start(async () => {
      const res = await setTaskStatus(taskId, next);
      if (!res.ok) {
        setOptimistic(prev);
        onChange?.(prev);
        toast.error(res.error);
      } else if (next === "DONE") {
        toast.success("Nice work — task completed.");
      }
    });
  };

  if (disabled) return <>{children(optimistic, false)}</>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-md outline-none" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
          {children(optimistic, pending)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Set status</DropdownMenuLabel>
        {STATUS_ORDER.map((s) => {
          const m = STATUS_META[s];
          return (
            <DropdownMenuItem key={s} onSelect={() => choose(s)}>
              <m.icon className={cn("!size-4", m.iconClass)} />
              <span className="flex-1">{m.label}</span>
              {s === optimistic && <Check className="!text-brand" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
