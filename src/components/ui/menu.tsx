"use client";

import * as React from "react";
import { DropdownMenu as M, Popover as P, Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";

const panel =
  "z-50 min-w-[12rem] overflow-hidden rounded-xl border border-line bg-surface-2 p-1 shadow-lg outline-none data-[state=open]:animate-[pop-in_160ms_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[pop-out_100ms_ease-in]";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;

export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={sideOffset} collisionPadding={8} className={cn(panel, "max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto", className)} {...props} />
    </M.Portal>
  );
}

export function DropdownMenuItem({
  className,
  tone,
  ...props
}: React.ComponentProps<typeof M.Item> & { tone?: "danger" }) {
  return (
    <M.Item
      className={cn(
        "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-fg outline-none transition-colors",
        "data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-fg-subtle",
        tone === "danger" && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <M.Separator className="-mx-1 my-1 h-px bg-line" />;
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={sideOffset} collisionPadding={8} className={cn(panel, "flex max-h-[var(--radix-popover-content-available-height)] flex-col p-0", className)} {...props} />
    </P.Portal>
  );
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <T.Provider delayDuration={250} skipDelayDuration={100}>{children}</T.Provider>;
}

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[60] rounded-lg bg-fg px-2.5 py-1.5 text-xs font-medium text-bg shadow-md data-[state=delayed-open]:animate-[pop-in_120ms_ease-out]"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
