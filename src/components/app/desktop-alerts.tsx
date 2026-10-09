"use client";

import * as React from "react";
import { BellRing, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Lets someone opt in to system notifications for deadlines and requests while the tab is in the background. */
export function DesktopAlerts({ compact }: { compact?: boolean }) {
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported" | null>(null);

  React.useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  if (permission === null || permission === "unsupported") return null;
  if (compact && permission === "granted") return null;

  const enable = async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      new Notification("Desktop alerts are on", { body: "You'll hear about deadlines and update requests here.", icon: "/icon.svg" });
      toast.success("Desktop alerts enabled.");
    } else if (result === "denied") {
      toast.error("Alerts are blocked. Allow notifications for this site in your browser settings.");
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand/20 bg-brand-soft/70 p-4 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-brand">
        {permission === "granted" ? <CheckCircle2 className="size-5" /> : <BellRing className="size-5" />}
      </span>
      <div className="flex-1">
        <p className="text-[14px] font-semibold">
          {permission === "granted" ? "Desktop alerts are on" : "Never miss a deadline"}
        </p>
        <p className="text-[13px] text-fg-muted">
          {permission === "granted"
            ? "You'll get a system notification for due-soon tasks and update requests while Focus Realm is in the background."
            : permission === "denied"
              ? "Notifications are blocked for this site. Allow them in your browser's site settings to turn alerts on."
              : "Get a system notification when a task is about to be due or someone asks you for an update."}
        </p>
      </div>
      {permission === "default" && (
        <Button onClick={enable} className="shrink-0">
          Turn on alerts
        </Button>
      )}
    </div>
  );
}
