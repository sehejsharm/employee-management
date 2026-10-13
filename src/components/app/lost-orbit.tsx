"use client";

import { motion } from "motion/react";
import { BrandMark } from "@/components/brand/logo";

/** The 404 illustration: a "4", the FR mark as the "0" with planets drifting around it, and a "4". */
export function LostOrbit() {
  return (
    <div className="relative flex items-center justify-center gap-2 sm:gap-6">
      <motion.span
        initial={{ opacity: 0, x: -30, rotate: -8 }}
        animate={{ opacity: 1, x: 0, rotate: -4 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="text-gradient-brand select-none text-[96px] font-semibold leading-none tracking-[-0.06em] min-[380px]:text-[120px] sm:text-[180px]"
      >
        4
      </motion.span>
      <div className="relative h-[104px] w-[104px] min-[380px]:h-[130px] min-[380px]:w-[130px] sm:h-[190px] sm:w-[190px]">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-brand/25"
            style={{ inset: `${i * 14}%` }}
            animate={{ rotate: i % 2 ? -360 : 360 }}
            transition={{ duration: 14 + i * 6, repeat: Infinity, ease: "linear" }}
          >
            <span
              className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400 shadow-[0_0_14px_3px_color-mix(in_srgb,var(--color-brand-400)_50%,transparent)]"
              style={{ opacity: 1 - i * 0.25 }}
            />
          </motion.div>
        ))}
        <motion.div
          className="absolute inset-[30%] flex items-center justify-center rounded-[28%] bg-surface shadow-lg ring-1 ring-line"
          animate={{ y: [0, -8, 0], rotate: [0, 4, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <BrandMark size={52} />
        </motion.div>
      </div>
      <motion.span
        initial={{ opacity: 0, x: 30, rotate: 8 }}
        animate={{ opacity: 1, x: 0, rotate: 4 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="text-gradient-brand select-none text-[96px] font-semibold leading-none tracking-[-0.06em] min-[380px]:text-[120px] sm:text-[180px]"
      >
        4
      </motion.span>
    </div>
  );
}
