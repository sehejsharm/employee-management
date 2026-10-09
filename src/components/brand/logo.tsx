import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The Focus Realm monogram: a sky-blue F interlocked with a royal-blue R.
 * Drawn inline so it stays crisp at every size and themes without assets.
 * To use the official artwork instead, drop it at public/brand/focus-realm.svg
 * and render <img src="/brand/focus-realm.svg"> here.
 */
export function BrandMark({
  size = 32,
  className,
  variant = "color",
}: {
  size?: number;
  className?: string;
  /** color: blue on light · inverse: white on blue/dark · tile: white rounded tile with blue mark. */
  variant?: "color" | "inverse" | "tile";
}) {
  const id = useId().replace(/:/g, "");
  const f = `fr-f-${id}`;
  const r = `fr-r-${id}`;
  const inverse = variant === "inverse";

  const mark = (
    <svg
      viewBox="0 0 64 64"
      width={variant === "tile" ? size * 0.72 : size}
      height={variant === "tile" ? size * 0.72 : size}
      role="img"
      aria-label="Focus Realm"
      className={variant === "tile" ? undefined : className}
    >
      <defs>
        <linearGradient id={f} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={inverse ? "#ffffff" : "#7cc0fa"} />
          <stop offset="100%" stopColor={inverse ? "#dcebfe" : "#3b8ef5"} />
        </linearGradient>
        <linearGradient id={r} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={inverse ? "#eaf3ff" : "#2f86f0"} />
          <stop offset="100%" stopColor={inverse ? "#bfdcfe" : "#1655c0"} />
        </linearGradient>
      </defs>
      {/* F — sky */}
      <g fill={`url(#${f})`}>
        <rect x="12" y="8" width="5" height="48" />
        <rect x="12" y="8" width="29" height="5" />
        <rect x="12" y="27.5" width="18" height="5" />
      </g>
      {/* R — royal, its bowl growing out of the F's middle arm */}
      <g fill={`url(#${r})`}>
        <path
          fillRule="evenodd"
          d="M26 56 V27.5 H40.5 A10 10 0 0 1 40.5 47.5 H31 V56 Z M31 32.5 V42.5 H40.5 A5 5 0 0 0 40.5 32.5 Z"
        />
        <path d="M35 47.5 H41 L52 56 H45.2 Z" />
      </g>
    </svg>
  );

  if (variant !== "tile") return mark;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-[28%] bg-white shadow-sm ring-1 ring-brand-100",
        "dark:ring-white/10",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {mark}
    </span>
  );
}

export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex flex-col leading-none", className)}>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Focus Realm</span>
      {!compact && (
        <span className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-subtle">Workspace</span>
      )}
    </span>
  );
}
