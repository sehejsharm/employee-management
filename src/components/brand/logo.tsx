import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The Focus Realm monogram: a tall royal-blue F whose middle arm reaches into
 * a slender sky-blue R. Drawn inline so it stays crisp at every size and
 * themes without assets. The same artwork lives in public/brand/focus-realm-mark.svg
 * and src/app/icon.svg (the browser tab icon).
 */
export function BrandMark({
  size = 32,
  className,
  variant = "color",
  parts,
}: {
  size?: number;
  className?: string;
  /** Class names for the F and R groups, so a screen can animate the letters (e.g. the splash). */
  parts?: { f?: string; r?: string };
  /** color: blue on light · inverse: white on blue/dark · tile: white rounded tile with blue mark. */
  variant?: "color" | "inverse" | "tile";
}) {
  const id = useId().replace(/:/g, "");
  const f = `fr-f-${id}`;
  const r = `fr-r-${id}`;
  const inverse = variant === "inverse";

  const mark = (
    <svg
      viewBox="-4 0 32 32"
      width={variant === "tile" ? size * 0.78 : size}
      height={variant === "tile" ? size * 0.78 : size}
      role="img"
      aria-label="Focus Realm"
      className={variant === "tile" ? undefined : className}
    >
      <defs>
        <linearGradient id={f} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor={inverse ? "#ffffff" : "#1f5fd1"} />
          <stop offset="100%" stopColor={inverse ? "#e6f0ff" : "#0f2f86"} />
        </linearGradient>
        <linearGradient id={r} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={inverse ? "#dff0ff" : "#a3dafd"} />
          <stop offset="100%" stopColor={inverse ? "#a9d4fb" : "#3f9be8"} />
        </linearGradient>
      </defs>
      {/* F — royal: tall stem, fine top bar with a turned-down end, middle arm reaching into the R */}
      <g fill={`url(#${f})`} className={parts?.f}>
        <rect x="3.4" y="2.4" width="2.4" height="27.4" />
        <rect x="3.4" y="2.4" width="15.7" height="1.1" />
        <path d="M15.4 3.5 H19.1 V6.2 Z" />
        <rect x="5.8" y="15.4" width="8.6" height="1.3" />
      </g>
      {/* R — sky, standing beside the F's stem */}
      <g className={parts?.r}>
        <rect x="6.6" y="12.4" width="1.9" height="17.4" fill={`url(#${r})`} />
        <g fill="none" stroke={`url(#${r})`} strokeWidth="0.95">
          <path d="M8.5 12.85 H13.4 C17.5 12.85 19.6 14.7 19.6 16.7 C19.6 18.7 17.5 20.5 13.4 20.5 H8.5" />
          <path d="M13.1 20.5 L20.2 29.8" strokeWidth="1.15" />
        </g>
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
