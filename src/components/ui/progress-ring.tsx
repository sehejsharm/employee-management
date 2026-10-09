import { cn } from "@/lib/utils";

export function ProgressRing({
  value,
  size = 36,
  stroke = 3.5,
  className,
  tone = "brand",
  label = true,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  tone?: "brand" | "success" | "warning" | "danger";
  label?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const color = { brand: "var(--brand)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)" }[tone];
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      {label && <span className="absolute text-[10px] font-semibold tabular text-fg-muted">{pct}</span>}
    </span>
  );
}

export function ProgressBar({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "success" | "danger" | "warning" }) {
  const pct = Math.max(0, Math.min(100, value));
  const bg = { brand: "bg-brand", success: "bg-success", danger: "bg-danger", warning: "bg-warning" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}
