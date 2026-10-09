import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface-sunken px-1.5 font-mono text-[10.5px] font-medium text-fg-subtle",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
