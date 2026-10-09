import {
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDot,
  OctagonAlert,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Flame,
  type LucideIcon,
} from "lucide-react";
import type { BadgeTone } from "@/components/ui/badge";

export type TaskStatusKey = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
export type TaskPriorityKey = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export const STATUS_ORDER: TaskStatusKey[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"];
export const PRIORITY_ORDER: TaskPriorityKey[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

export const STATUS_META: Record<
  TaskStatusKey,
  { label: string; icon: LucideIcon; iconClass: string; tone: BadgeTone; column: string }
> = {
  TODO: { label: "To do", icon: Circle, iconClass: "text-fg-subtle", tone: "neutral", column: "bg-slate-400" },
  IN_PROGRESS: { label: "In progress", icon: CircleDashed, iconClass: "text-brand", tone: "brand", column: "bg-brand" },
  IN_REVIEW: { label: "In review", icon: CircleDot, iconClass: "text-violet-500", tone: "violet", column: "bg-violet-500" },
  BLOCKED: { label: "Blocked", icon: OctagonAlert, iconClass: "text-danger", tone: "danger", column: "bg-danger" },
  DONE: { label: "Done", icon: CheckCircle2, iconClass: "text-success", tone: "success", column: "bg-success" },
};

export const PRIORITY_META: Record<TaskPriorityKey, { label: string; icon: LucideIcon; className: string; tone: BadgeTone; weight: number }> = {
  URGENT: { label: "Urgent", icon: Flame, className: "text-danger", tone: "danger", weight: 4 },
  HIGH: { label: "High", icon: SignalHigh, className: "text-warning", tone: "warning", weight: 3 },
  MEDIUM: { label: "Medium", icon: SignalMedium, className: "text-brand", tone: "brand", weight: 2 },
  LOW: { label: "Low", icon: SignalLow, className: "text-fg-subtle", tone: "neutral", weight: 1 },
};
