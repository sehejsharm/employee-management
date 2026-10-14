"use client";

import * as React from "react";
import { BellOff, BellRing, CheckCircle2, Share, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendTestPush } from "@/actions/push";
import { disablePush, enablePush, isInstalled, pushState, syncPush, type PushState } from "@/lib/push-client";
import { cn } from "@/lib/utils";

const BANNER_KEY = "fr-push-banner-hidden";
const BANNER_SNOOZE_MS = 14 * 24 * 3600_000;

function bannerHidden() {
  try {
    return Date.now() - Number(localStorage.getItem(BANNER_KEY) || 0) < BANNER_SNOOZE_MS;
  } catch {
    return false;
  }
}

/** Keeps this device's notification subscription current. Mounted once in the app shell. */
export function PushSync() {
  React.useEffect(() => {
    void syncPush();
  }, []);
  return null;
}

function usePushState() {
  const [state, setState] = React.useState<PushState | null>(null);
  const refresh = React.useCallback(() => {
    void pushState().then(setState);
  }, []);
  React.useEffect(refresh, [refresh]);
  return [state, setState, refresh] as const;
}

function IosSteps({ className }: { className?: string }) {
  return (
    <ol className={cn("list-decimal space-y-1 pl-5 text-[13px] text-fg-muted", className)}>
      <li>
        In Safari, tap <Share className="inline size-3.5 -translate-y-px" aria-label="Share" /> <b className="font-medium text-fg">Share</b>.
      </li>
      <li>
        Choose <b className="font-medium text-fg">Add to Home Screen</b>, then <b className="font-medium text-fg">Add</b>.
      </li>
      <li>Open Focus Realm from your home screen, sign in, and turn notifications on there.</li>
    </ol>
  );
}

/**
 * Settings: turn notifications on or off for this device. When on, "Meet now"
 * calls ring it and updates reach it even with the Workspace closed.
 */
export function NotificationSetup() {
  const [state, setState, refresh] = usePushState();
  const [busy, setBusy] = React.useState(false);

  if (state === null) return <div className="h-20 animate-pulse rounded-2xl bg-surface-sunken" />;

  const turnOn = async () => {
    setBusy(true);
    const res = await enablePush();
    setBusy(false);
    if (res.ok) {
      setState("on");
      toast.success("Notifications are on for this device.");
    } else {
      toast.error(res.error);
      refresh();
    }
  };
  const turnOff = async () => {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setState("off");
    toast.success("Notifications are off on this device.");
  };
  const test = async () => {
    setBusy(true);
    const res = await sendTestPush();
    setBusy(false);
    if (res.ok) toast.success(res.message);
    else toast.error(res.error);
  };

  const copy: Record<PushState, { icon: React.ReactNode; title: string; body: React.ReactNode }> = {
    on: {
      icon: <CheckCircle2 className="size-5" />,
      title: "Notifications are on for this device",
      body: "When someone calls you with Meet now, this device rings — and task, meeting and announcement updates reach you even when the Workspace is closed.",
    },
    off: {
      icon: <BellRing className="size-5" />,
      title: "Get calls and updates on this device",
      body: "Turn this on so a Meet now call rings your phone like a call, and new tasks, meetings and announcements reach you even when the Workspace is closed.",
    },
    blocked: {
      icon: <BellOff className="size-5" />,
      title: "Notifications are blocked here",
      body: "You (or your browser) said no earlier. Allow notifications for Focus Realm in your phone's or browser's settings, then come back and turn them on.",
    },
    install: {
      icon: <Smartphone className="size-5" />,
      title: "Add the Workspace to your home screen first",
      body: <IosSteps className="mt-1" />,
    },
    unsupported: {
      icon: <BellOff className="size-5" />,
      title: "This browser can't get notifications",
      body: "Use Chrome on Android or a computer, or Safari on iPhone with the Workspace added to your home screen.",
    },
  };
  const c = copy[state];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-2xl border border-brand/20 bg-brand-soft/70 p-4 sm:flex-row sm:items-start">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-brand">{c.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">{c.title}</p>
          <div className="text-[13px] text-fg-muted">{c.body}</div>
        </div>
        {state === "off" && (
          <Button onClick={turnOn} disabled={busy} className="shrink-0">
            {busy ? "Turning on…" : "Turn on"}
          </Button>
        )}
      </div>
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={test} disabled={busy}>
            Send a test
          </Button>
          <Button variant="ghost" onClick={turnOff} disabled={busy}>
            Turn off on this device
          </Button>
        </div>
      )}
      {(state === "on" || state === "off") && (
        <p className="text-[12px] leading-relaxed text-fg-subtle">
          Turn this on separately on each phone and computer you use. On a phone, a call rings and vibrates every few seconds for up to 90 seconds — make sure
          notifications from Focus Realm{!isInstalled() ? " (or your browser)" : ""} are allowed to make sound and aren&apos;t silenced by Do Not Disturb.
        </p>
      )}
    </div>
  );
}

/**
 * A nudge on the dashboard and inbox for devices that could get notifications
 * but don't yet. Hidden for two weeks when dismissed.
 */
export function NotificationBanner({ className }: { className?: string }) {
  const [state, setState] = usePushState();
  // Read from the browser after hydration (hidden while rendering on the server).
  const snoozed = React.useSyncExternalStore(
    () => () => {},
    bannerHidden,
    () => true,
  );
  const [dismissed, setDismissed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  if (snoozed || dismissed || (state !== "off" && state !== "install")) return null;

  const hide = () => {
    try {
      localStorage.setItem(BANNER_KEY, String(Date.now()));
    } catch {}
    setDismissed(true);
  };
  const turnOn = async () => {
    setBusy(true);
    const res = await enablePush();
    setBusy(false);
    if (res.ok) {
      setState("on");
      toast.success("Done — calls will ring this device.");
    } else toast.error(res.error);
  };

  return (
    <div className={cn("relative flex flex-col gap-3 rounded-2xl border border-brand/20 bg-brand-soft/70 p-4 pr-11 sm:flex-row sm:items-center", className)}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-brand">
        {state === "install" ? <Smartphone className="size-5" /> : <BellRing className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{state === "install" ? "Get the Workspace app on your iPhone" : "Don't miss a call"}</p>
        {state === "install" ? (
          <IosSteps className="mt-1" />
        ) : (
          <p className="text-[13px] text-fg-muted">Turn on notifications so Meet now calls ring this device, and updates reach you even when the Workspace is closed.</p>
        )}
      </div>
      {state === "off" && (
        <Button onClick={turnOn} disabled={busy} className="shrink-0">
          {busy ? "Turning on…" : "Turn on"}
        </Button>
      )}
      <button
        type="button"
        onClick={hide}
        aria-label="Hide for now"
        className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-xl text-fg-subtle transition hover:bg-surface hover:text-fg"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
