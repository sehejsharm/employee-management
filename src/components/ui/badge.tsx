import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-surface-sunken text-fg-muted ring-line",
  brand: "bg-brand-soft text-brand-soft-fg ring-brand/15",
  success: "bg-success-soft text-success ring-success/15",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/15",
  info: "bg-info-soft text-info ring-info/15",
  brandSolid: "bg-brand text-brand-fg ring-brand",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ring-1 ring-inset [&_svg]:size-3.5",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Department colours. Keys are stored on Department.color. */
export const DEPARTMENT_COLORS: Record<string, { dot: string; soft: string; text: string; bar: string }> = {
  blue: { dot: "bg-blue-500", soft: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-300", bar: "from-blue-400 to-blue-600" },
  sky: { dot: "bg-sky-500", soft: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-300", bar: "from-sky-300 to-sky-500" },
  indigo: { dot: "bg-indigo-500", soft: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-300", bar: "from-indigo-400 to-indigo-600" },
  violet: { dot: "bg-violet-500", soft: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-300", bar: "from-violet-400 to-violet-600" },
  teal: { dot: "bg-teal-500", soft: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-300", bar: "from-teal-300 to-teal-500" },
  emerald: { dot: "bg-emerald-500", soft: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-300", bar: "from-emerald-300 to-emerald-500" },
  amber: { dot: "bg-amber-500", soft: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-300", bar: "from-amber-300 to-amber-500" },
  rose: { dot: "bg-rose-500", soft: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-300", bar: "from-rose-400 to-rose-600" },
  slate: { dot: "bg-slate-500", soft: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-300", bar: "from-slate-400 to-slate-600" },
};

export const DEPARTMENT_COLOR_KEYS = Object.keys(DEPARTMENT_COLORS);

export function deptColor(key: string | null | undefined) {
  return DEPARTMENT_COLORS[key ?? "blue"] ?? DEPARTMENT_COLORS.blue;
}

export function DepartmentTag({ name, color, className }: { name: string; color?: string | null; className?: string }) {
  const c = deptColor(color);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", c.text, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {name}
    </span>
  );
}
