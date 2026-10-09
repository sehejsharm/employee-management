import { cn, initials } from "@/lib/utils";

export interface AvatarPerson {
  firstName: string;
  lastName: string;
  avatarHue?: number | null;
}

const SIZES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-[13px]",
  lg: "h-12 w-12 text-base",
  xl: "h-20 w-20 text-2xl",
} as const;

/** Initials on a soft gradient derived from the person's hue — no photos, no tracking pixels. */
export function Avatar({
  person,
  size = "md",
  className,
  ring,
  dimmed,
}: {
  person: AvatarPerson;
  size?: keyof typeof SIZES;
  className?: string;
  ring?: boolean;
  dimmed?: boolean;
}) {
  const hue = person.avatarHue ?? 212;
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight text-white",
        ring && "ring-2 ring-surface",
        dimmed && "grayscale opacity-60",
        SIZES[size],
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(140deg, hsl(${hue} 85% 66%), hsl(${(hue + 18) % 360} 72% 46%))`,
      }}
      title={`${person.firstName} ${person.lastName}`.trim()}
      aria-hidden
    >
      {initials(person)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  className,
}: {
  people: (AvatarPerson & { id: string })[];
  max?: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className={cn("flex items-center -space-x-1.5", className)}>
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size={size} ring />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-surface-sunken font-medium text-fg-muted ring-2 ring-surface",
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
