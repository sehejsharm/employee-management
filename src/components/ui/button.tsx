import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

const VARIANTS = {
  primary:
    "bg-brand text-brand-fg shadow-[0_1px_0_0_rgba(255,255,255,0.18)_inset,0_1px_2px_rgba(10,20,38,0.12)] hover:bg-brand-hover hover:shadow-brand",
  secondary:
    "bg-surface text-fg border border-line shadow-xs hover:bg-surface-hover hover:border-line-strong",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-hover",
  soft: "bg-brand-soft text-brand-soft-fg hover:bg-brand-soft/70",
  danger: "bg-danger text-white shadow-xs hover:brightness-110",
  "danger-ghost": "text-danger hover:bg-danger-soft",
} as const;

const SIZES = {
  xs: "h-7 gap-1.5 rounded-lg px-2.5 text-xs",
  sm: "h-8 gap-1.5 rounded-[9px] px-3 text-[13px]",
  md: "h-9 gap-2 rounded-[10px] px-3.5 text-sm",
  lg: "h-11 gap-2 rounded-xl px-5 text-[15px]",
  icon: "h-9 w-9 rounded-[10px]",
  "icon-sm": "h-8 w-8 rounded-[9px]",
  "icon-xs": "h-7 w-7 rounded-lg",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", asChild, loading, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner className="absolute" />}
          <span className={cn("inline-flex items-center gap-[inherit]", loading && "invisible")}>{children}</span>
        </>
      )}
    </Comp>
  );
});
