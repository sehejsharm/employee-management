"use client";

import * as React from "react";
import { useActionState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Eye, EyeOff, IdCard, KeyRound, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { login, type AuthFormState } from "../actions";

const EASE = [0.16, 1, 0.3, 1] as const;

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(login, {});
  const [show, setShow] = React.useState(false);
  // Controlled so a wrong password doesn't also wipe the ID (React resets uncontrolled fields after each submission).
  const [identifier, setIdentifier] = React.useState("");
  // Every new error replays the shake: count them as each result arrives.
  const [attempt, setAttempt] = React.useState(0);
  const [lastState, setLastState] = React.useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.error) setAttempt((a) => a + 1);
  }

  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="w-full max-w-[400px]"
      >
        <div className="mb-9 flex items-center gap-3 lg:hidden">
          <BrandMark size={40} variant="tile" />
          <div className="leading-none">
            <div className="text-[16px] font-semibold tracking-tight">Focus Realm</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-fg-subtle">Workspace</div>
          </div>
        </div>

        <h2 className="text-[28px] font-semibold tracking-[-0.025em] text-fg">Welcome back</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">
          Sign in with the employee ID and password issued to you by Focus Realm HR.
        </p>

        <motion.form
          key={attempt}
          action={action}
          animate={attempt > 0 ? { x: [0, -8, 7, -5, 3, 0] } : undefined}
          transition={{ duration: 0.45 }}
          className="mt-8 space-y-5"
        >
          <input type="hidden" name="next" value={next} />

          <div>
            <Label htmlFor="identifier">Employee ID</Label>
            <div className="relative">
              <IdCard className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle" />
              <Input
                id="identifier"
                name="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="FR-0042"
                className="h-12 rounded-xl pl-11 text-base"
                aria-invalid={state.field === "identifier"}
                autoFocus
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle" />
              <Input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••••"
                className="h-12 rounded-xl px-11 text-base"
                aria-invalid={state.field === "password"}
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-fg-subtle transition hover:bg-surface-hover hover:text-fg"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
              </button>
            </div>
          </div>

          <label className="flex cursor-pointer select-none items-center gap-2.5 text-[13.5px] text-fg-muted">
            <input
              type="checkbox"
              name="remember"
              defaultChecked
              className="h-4 w-4 cursor-pointer rounded border-line-strong accent-[var(--brand)]"
            />
            Keep me signed in on this device
          </label>

          <AnimatePresence initial={false}>
            {state.error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
                  {state.error}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button type="submit" size="lg" loading={pending} className="group h-12 w-full rounded-xl text-[15px]">
            Sign in
            <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Button>
        </motion.form>

        <div className="mt-8 flex items-start gap-3 rounded-xl border border-line bg-surface-sunken/70 px-4 py-3.5 text-[12.5px] leading-relaxed text-fg-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
          <p>
            Your login is created automatically when HR adds you to the Focus Realm HR console. You always sign in
            with your own employee ID — never your email, since colleagues can share one. Forgotten your password?
            Ask HR or a founder to reset it.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
