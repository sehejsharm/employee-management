"use client";

import { motion } from "motion/react";
import { CalendarClock, CheckCircle2, MessageSquareMore, Network } from "lucide-react";
import { BrandMark } from "@/components/brand/logo";

const EASE = [0.16, 1, 0.3, 1] as const;

/** The left half of the sign-in screen: the brand, in motion. Hidden on small screens. */
export function AuthShowcase() {
  return (
    <aside className="relative hidden overflow-hidden bg-[#071630] text-white lg:flex lg:flex-col">
      {/* Layered blue light */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_0%,#1a6ae0_0%,#0d3a85_38%,#071630_75%)]" />
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(to_right,rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(80%_70%_at_30%_30%,#000,transparent)]" />

      {/* Focus rings */}
      <div className="pointer-events-none absolute -right-40 top-1/2 h-[760px] w-[760px] -translate-y-1/2">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-white/10"
            style={{ scale: 1 - i * 0.2 }}
            initial={{ opacity: 0, rotate: -20 }}
            animate={{ opacity: 1, rotate: 0 }}
            transition={{ duration: 1.6, ease: EASE, delay: 0.15 * i }}
          />
        ))}
        <motion.div
          className="absolute inset-[38%] rounded-full bg-[radial-gradient(circle,#5aa7f8_0%,rgba(90,167,248,0)_70%)] blur-2xl"
          animate={{ opacity: [0.55, 0.9, 0.55], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        >
          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300 shadow-[0_0_24px_6px_rgba(146,197,253,0.6)]" />
        </motion.div>
        <motion.div
          className="absolute inset-[20%]"
          animate={{ rotate: -360 }}
          transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
        >
          <span className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow-[0_0_18px_4px_rgba(255,255,255,0.5)]" />
        </motion.div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-between p-12 xl:p-16">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="flex items-center gap-3"
        >
          <BrandMark size={40} variant="tile" />
          <div className="leading-none">
            <div className="text-[17px] font-semibold tracking-tight">Focus Realm</div>
            <div className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.22em] text-white/55">Workspace</div>
          </div>
        </motion.div>

        <div className="max-w-lg">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
            className="text-balance text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] xl:text-[52px]"
          >
            Where Focus Realm
            <br />
            <span className="bg-gradient-to-r from-white via-brand-200 to-brand-400 bg-clip-text text-transparent">
              gets things done.
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.22 }}
            className="mt-5 max-w-md text-[15px] leading-relaxed text-white/65"
          >
            Assignments with real deadlines, updates without the chasing, and one clear picture of who leads what.
          </motion.p>

          <div className="relative mt-12 h-[210px]">
            <FloatingCard
              delay={0.4}
              className="left-0 top-0"
              icon={<CalendarClock className="size-4" />}
              title="T-128 · Investor update deck"
              meta="Due today, 6:00 PM · in 3h 20m"
              accent="from-amber-300 to-amber-500"
            />
            <FloatingCard
              delay={0.55}
              className="left-24 top-[78px]"
              icon={<MessageSquareMore className="size-4" />}
              title="Update requested"
              meta="“Where are we on the vendor list?”"
              accent="from-brand-300 to-brand-500"
            />
            <FloatingCard
              delay={0.7}
              className="left-6 top-[156px]"
              icon={<CheckCircle2 className="size-4" />}
              title="Market research brief — done"
              meta="Marked complete by Riya · 2m ago"
              accent="from-emerald-300 to-emerald-500"
            />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="flex items-center gap-6 text-[12.5px] text-white/50"
        >
          <span className="inline-flex items-center gap-2">
            <Network className="size-3.5" /> One org, one source of truth
          </span>
          <span className="h-1 w-1 rounded-full bg-white/25" />
          <span>Accounts issued by Focus Realm HR</span>
        </motion.div>
      </div>
    </aside>
  );
}

function FloatingCard({
  className,
  icon,
  title,
  meta,
  accent,
  delay,
}: {
  className: string;
  icon: React.ReactNode;
  title: string;
  meta: string;
  accent: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      className={`absolute ${className}`}
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 6 + delay * 4, repeat: Infinity, ease: "easeInOut", delay: delay * 2 }}
        className="flex w-[330px] items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.07] p-3.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-[#071630]`}>
          {icon}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium text-white">{title}</div>
          <div className="mt-0.5 truncate text-xs text-white/55">{meta}</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
