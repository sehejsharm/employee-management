"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Entrances are CSS (the `animate-rise` utility), not JavaScript: they start
 * with the first paint of the server-rendered page, so content is readable
 * before the app's JavaScript has even loaded. A JS animation would have to
 * render it invisible first and wait for hydration to reveal it.
 */

/** Content that settles into place: a short rise and fade. */
export function FadeIn({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("animate-rise", className)} {...rest}>
      {children}
    </div>
  );
}

/** A group whose items (StaggerItem) rise in together. */
export function Stagger({ className, children, as = "div" }: { className?: string; children: React.ReactNode; as?: "div" | "ul" | "section" }) {
  const Comp = as;
  return <Comp className={className}>{children}</Comp>;
}

export function StaggerItem({ className, children, as = "div", ...rest }: { as?: "div" | "li" } & React.HTMLAttributes<HTMLElement>) {
  const Comp = as;
  return (
    <Comp className={cn("animate-rise", className)} {...rest}>
      {children}
    </Comp>
  );
}

const NUMBER = new Intl.NumberFormat("en-US");

/** A headline figure, shown at its real value from the first paint. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  return <span className={className}>{NUMBER.format(Math.round(value))}</span>;
}

export { motion, AnimatePresence, LayoutGroup } from "motion/react";
