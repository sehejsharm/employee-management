"use client";

import * as React from "react";
import { Check, Laptop, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { changePassword, signOutOtherSessions, updateProfile } from "@/actions/profile";
import { PASSWORD_RULES } from "@/lib/auth/password-rules";
import { cn } from "@/lib/utils";
import { useTheme, type ThemePreference } from "./providers";

const HUES = [212, 200, 190, 228, 245, 260, 280, 300, 330, 350, 15, 35, 150, 170];

export function ProfileForm({
  initial,
}: {
  initial: { firstName: string; lastName: string; phone: string; location: string; bio: string; avatarHue: number };
}) {
  const [form, setForm] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const save = () =>
    start(async () => {
      const res = await updateProfile({ phone: form.phone, location: form.location, bio: form.bio, avatarHue: form.avatarHue });
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar person={form} size="xl" />
        <div>
          <div className="text-[13px] font-medium">Avatar colour</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {HUES.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setForm((f) => ({ ...f, avatarHue: h }))}
                className={cn("flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition", form.avatarHue === h && "ring-2 ring-brand")}
                style={{ backgroundImage: `linear-gradient(140deg, hsl(${h} 85% 66%), hsl(${(h + 18) % 360} 72% 46%))` }}
                aria-label={`Hue ${h}`}
              >
                {form.avatarHue === h && <Check className="size-3.5 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Phone" optional>
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 98xxx xxxxx" />
        </Field>
        <Field label="Location" optional>
          <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Mumbai" />
        </Field>
        <Field label="About you" optional className="sm:col-span-2" hint="A line or two your colleagues will see on your profile.">
          <Textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} maxLength={600} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} loading={pending}>
          Save profile
        </Button>
      </div>
    </div>
  );
}

export function AppearanceForm() {
  const { preference, setPreference } = useTheme();
  const options: { value: ThemePreference; label: string; icon: React.ReactNode; preview: string }[] = [
    { value: "light", label: "Light", icon: <Sun />, preview: "bg-canvas-light" },
    { value: "dark", label: "Dark", icon: <Moon />, preview: "bg-canvas-dark" },
    { value: "system", label: "System", icon: <Monitor />, preview: "bg-[linear-gradient(90deg,var(--color-canvas-light)_50%,var(--color-canvas-dark)_50%)]" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setPreference(o.value)}
          className={cn(
            "overflow-hidden rounded-2xl border text-left transition",
            preference === o.value ? "border-brand ring-4 ring-brand/15" : "border-line hover:border-line-strong",
          )}
        >
          <div className={cn("relative h-20 border-b border-line", o.preview)}>
            <div className="absolute left-3 top-3 h-2 w-10 rounded-full bg-brand" />
            <div className="absolute left-3 top-7 h-1.5 w-16 rounded-full bg-brand-200/60" />
            <div className="absolute left-3 top-10 h-1.5 w-12 rounded-full bg-brand-200/35" />
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium [&_svg]:size-4 [&_svg]:text-fg-subtle">
            {o.icon} {o.label}
          </div>
        </button>
      ))}
    </div>
  );
}

export function PasswordForm() {
  const [form, setForm] = React.useState({ current: "", next: "", confirm: "" });
  const [pending, start] = React.useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await changePassword(form);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setForm({ current: "", next: "", confirm: "" });
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Current password">
        <Input type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} required />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="New password">
          <Input type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))} required />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} required />
        </Field>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {PASSWORD_RULES.map((r) => (
          <li key={r.id} className={cn("flex items-center gap-1.5 text-xs", r.test(form.next) ? "text-success" : "text-fg-subtle")}>
            <Check className="size-3" /> {r.label}
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Change password
        </Button>
      </div>
    </form>
  );
}

export function SessionsList({ sessions, tz }: { sessions: { id: string; device: string | null; createdAt: string; current: boolean }[]; tz: string }) {
  const [pending, start] = React.useTransition();
  return (
    <div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <Laptop className="size-4 text-fg-subtle" />
            <div className="flex-1">
              <div className="text-[13.5px] font-medium">
                {s.device ?? "Unknown device"}
                {s.current && <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">This device</span>}
              </div>
              <div className="text-xs text-fg-subtle">Signed in {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz })}</div>
            </div>
          </li>
        ))}
      </ul>
      {sessions.length > 1 && (
        <Button
          variant="secondary"
          className="mt-3"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await signOutOtherSessions();
              if (res.ok) toast.success(res.message);
              else toast.error(res.error);
            })
          }
        >
          <LogOut /> Sign out of other devices
        </Button>
      )}
    </div>
  );
}
