"use client";

import * as React from "react";
import { useActionState } from "react";
import { motion } from "motion/react";
import { Check, Eye, EyeOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PASSWORD_RULES } from "@/lib/auth/password-rules";
import { cn } from "@/lib/utils";
import { choosePassword, logout, type AuthFormState } from "../actions";

const EASE = [0.16, 1, 0.3, 1] as const;

export function WelcomeForm({ firstName, employeeCode }: { firstName: string; employeeCode: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(choosePassword, {});
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const strength = passed / PASSWORD_RULES.length;

  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="w-full max-w-[420px]"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-soft-fg">
          <Sparkles className="size-3.5" /> First sign-in · {employeeCode}
        </span>
        <h2 className="mt-4 text-[28px] font-semibold tracking-[-0.025em]">Welcome to Focus Realm, {firstName}.</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">
          You signed in with a temporary password from HR. Choose your own to finish setting up your account.
        </p>

        <form action={action} className="mt-8 space-y-5">
          <div>
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl pr-11 text-[15px]"
                aria-invalid={state.field === "password"}
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-fg-subtle hover:bg-surface-hover hover:text-fg"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
              </button>
            </div>
            <div className="mt-3 flex gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      strength < 0.5 ? "bg-danger" : strength < 1 ? "bg-warning" : "bg-success",
                    )}
                    initial={false}
                    animate={{ width: i < passed ? "100%" : "0%" }}
                    transition={{ duration: 0.35, ease: EASE }}
                  />
                </div>
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(password);
                return (
                  <li key={rule.id} className={cn("flex items-center gap-1.5 text-xs transition-colors", ok ? "text-success" : "text-fg-subtle")}>
                    <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors", ok ? "bg-success text-white" : "bg-surface-sunken")}>
                      {ok && <Check className="size-2.5" strokeWidth={3.5} />}
                    </span>
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-12 rounded-xl text-[15px]"
              aria-invalid={state.field === "confirm" || (confirm.length > 0 && confirm !== password)}
              required
            />
          </div>

          {state.error && (
            <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
              {state.error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            loading={pending}
            disabled={passed < PASSWORD_RULES.length || password !== confirm}
            className="h-12 w-full rounded-xl text-[15px]"
          >
            Save password and continue
          </Button>
        </form>

        <form action={logout} className="mt-4 text-center">
          <button className="text-[13px] text-fg-subtle underline-offset-4 hover:text-fg hover:underline">Sign out</button>
        </form>
      </motion.div>
    </div>
  );
}
