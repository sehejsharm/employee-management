"use client";

import * as React from "react";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Content that settles into place: a short rise and fade. */
export function FadeIn({
  delay = 0,
  y = 10,
  className,
  children,
  ...rest
}: { delay?: number; y?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

const container = {
  hidden: {},
  show: (stagger: number) => ({ transition: { staggerChildren: stagger, delayChildren: 0.04 } }),
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

export function Stagger({
  stagger = 0.05,
  className,
  children,
  as = "div",
}: {
  stagger?: number;
  className?: string;
  children: React.ReactNode;
  as?: "div" | "ul" | "section";
}) {
  const Comp = as === "ul" ? motion.ul : as === "section" ? motion.section : motion.div;
  return (
    <Comp variants={container} custom={stagger} initial="hidden" animate="show" className={className}>
      {children}
    </Comp>
  );
}

export function StaggerItem({
  className,
  children,
  as = "div",
  ...rest
}: { as?: "div" | "li" } & HTMLMotionProps<"div">) {
  const Comp = (as === "li" ? motion.li : motion.div) as typeof motion.div;
  return (
    <Comp variants={item} className={className} {...rest}>
      {children}
    </Comp>
  );
}

/** Animated number for headline stats. */
export function CountUp({ value, className, duration = 1.1 }: { value: number; className?: string; duration?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  // Start at zero on the server and the client alike (hydration-safe); reduced motion jumps straight to the value.
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString());

  React.useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration: reduce ? 0 : duration, ease: EASE });
    return () => controls.stop();
  }, [inView, value, duration, mv, reduce]);

  return (
    <motion.span ref={ref} className={className}>
      {rounded}
    </motion.span>
  );
}

export { motion, AnimatePresence, LayoutGroup } from "motion/react";
