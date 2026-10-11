import {
  AlarmClock,
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  ShieldCheck,
  ClipboardList,
  Megaphone,
  MessageCircleQuestion,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAP: Record<string, { icon: React.ElementType; className: string }> = {
  TASK_ASSIGNED: { icon: ClipboardList, className: "bg-brand-soft text-brand-soft-fg" },
  TASK_DUE_SOON: { icon: AlarmClock, className: "bg-warning-soft text-warning" },
  TASK_OVERDUE: { icon: AlertTriangle, className: "bg-danger-soft text-danger" },
  UPDATE_REQUESTED: { icon: MessageCircleQuestion, className: "bg-info-soft text-info" },
  UPDATE_POSTED: { icon: TrendingUp, className: "bg-success-soft text-success" },
  TASK_COMMENT: { icon: MessageSquare, className: "bg-surface-sunken text-fg-muted" },
  TASK_STATUS: { icon: RefreshCw, className: "bg-brand-soft text-brand-soft-fg" },
  TASK_COMPLETED: { icon: CheckCircle2, className: "bg-success-soft text-success" },
  ANNOUNCEMENT: { icon: Megaphone, className: "bg-brand-soft text-brand-soft-fg" },
  SYSTEM: { icon: Sparkles, className: "bg-brand-soft text-brand-soft-fg" },
  WORK_SUBMITTED: { icon: FileCheck2, className: "bg-info-soft text-info" },
  WORK_REVIEWED: { icon: BadgeCheck, className: "bg-success-soft text-success" },
  CLEARANCE: { icon: ShieldCheck, className: "bg-brand-soft text-brand-soft-fg" },
};

export function NotificationIcon({ kind, className }: { kind: string; className?: string }) {
  const entry = MAP[kind] ?? MAP.SYSTEM;
  const Icon = entry.icon;
  return (
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]", entry.className, className)}>
      <Icon className="size-4" />
    </span>
  );
}
