"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  size = "md",
  hideClose,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  hideClose?: boolean;
}) {
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-[3px] data-[state=closed]:animate-[fade-out_150ms_ease-in] data-[state=open]:animate-[fade-in_200ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lg outline-none",
          "data-[state=open]:animate-[dialog-in_260ms_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[dialog-out_150ms_ease-in]",
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-[16px] font-semibold tracking-[-0.01em] text-fg">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-[13px] text-fg-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>
            )}
          </div>
          {!hideClose && (
            <D.Close className="-mr-1.5 -mt-0.5 rounded-lg p-1.5 text-fg-subtle transition hover:bg-surface-hover hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("-mx-5 -mb-5 mt-6 flex flex-col-reverse gap-2 border-t border-line bg-surface-sunken/60 px-5 py-3.5 sm:flex-row sm:justify-end", className)}>
      {children}
    </div>
  );
}

/** A right-hand drawer (bottom sheet on phones) built on the same primitive. */
export function SheetContent({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-[2px] data-[state=open]:animate-[fade-in_200ms_ease-out] data-[state=closed]:animate-[fade-out_150ms_ease-in]" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden border-line bg-surface shadow-lg outline-none",
          "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl border-t sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:border-l sm:border-t-0",
          "data-[state=open]:animate-[sheet-in-up_320ms_cubic-bezier(0.16,1,0.3,1)] sm:data-[state=open]:animate-[sheet-in-right_320ms_cubic-bezier(0.16,1,0.3,1)]",
          className,
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-[16px] font-semibold tracking-[-0.01em]">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-[13px] text-fg-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : "Panel"}</D.Description>
            )}
          </div>
          <D.Close className="-mr-1.5 rounded-lg p-1.5 text-fg-subtle transition hover:bg-surface-hover hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
