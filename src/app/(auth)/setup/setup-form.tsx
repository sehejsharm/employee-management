"use client";

import * as React from "react";
import { useActionState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Check, Eye, EyeOff, KeyRound, Rocket } from "lucide-react";
import { BrandMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PASSWORD_RULES } from "@/lib/auth/password-rules";
import { cn } from "@/lib/utils";
import { setupWorkspace, type AuthFormState } from "../actions";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Creates the first founder. The server re-checks everything, including that no founder exists yet. */
export function SetupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(setupWorkspace, {});
  // Controlled, because React resets uncontrolled fields after every submission — a wrong token shouldn't wipe the form.
  const [fields, setFields] = React.useState({ token: "", firstName: "", lastName: "", title: "", email: "" });
  const bind = (name: keyof typeof fields) => ({
    name,
    value: fields[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [name]: e.target.value })),
  });
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;

  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="w-full max-w-[440px]"
      >
        <div className="mb-9 flex items-center gap-3 lg:hidden">
          <BrandMark size={40} variant="tile" />
          <div className="leading-none">
            <div className="text-[16px] font-semibold tracking-tight">Focus Realm</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-fg-subtle">Workspace</div>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-soft-fg">
          <Rocket className="size-3.5" /> First-time setup
        </span>
        <h2 className="mt-4 text-[28px] font-semibold tracking-[-0.025em]">Create the first founder account</h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">
          This page works once. As soon as this account exists it switches itself off, and everyone else is added from the HR
          console or the People screen.
        </p>

        <form action={action} className="mt-8 space-y-5">
          <div>
            <Label htmlFor="token">Setup token</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle" />
              <Input
                id="token"
                {...bind("token")}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="The SETUP_TOKEN value from Vercel"
                className="h-12 rounded-xl pl-11 text-base"
                aria-invalid={state.field === "token"}
                autoFocus
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" {...bind("firstName")} autoComplete="given-name" className="h-12 rounded-xl text-base" aria-invalid={state.field === "firstName"} required />
            </div>
            <div>
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" {...bind("lastName")} autoComplete="family-name" className="h-12 rounded-xl text-base" />
            </div>
          </div>

          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...bind("title")} placeholder="Co-founder & CEO" className="h-12 rounded-xl text-base" />
          </div>

          <div>
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              {...bind("email")}
              type="email"
              autoComplete="email"
              placeholder="you@focusrealm.com"
              className="h-12 rounded-xl text-base"
              aria-invalid={state.field === "email"}
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl pr-11 text-base"
                aria-invalid={state.field === "password"}
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
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {PASSWORD_RULES.map((rule) => {
                const ok = rule.test(password);
                return (
                  <li key={rule.id} className={cn("flex items-center gap-1.5 text-xs transition-colors", ok ? "text-success" : "text-fg-subtle")}>
                    <span
                      className={cn(
                        "flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors",
                        ok ? "bg-success text-white" : "bg-surface-sunken",
                      )}
                    >
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
              className="h-12 rounded-xl text-base"
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
            className="group h-12 w-full rounded-xl text-[15px]"
          >
            Create account and sign in
            <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
