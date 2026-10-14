import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 sm:min-w-[16rem] sm:flex-1">
        {eyebrow && <div className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-brand">{eyebrow}</div>}
        <h1 className="text-balance text-[26px] font-semibold leading-tight tracking-[-0.025em] text-fg wrap-anywhere sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}
