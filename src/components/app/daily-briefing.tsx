"use client";

import * as React from "react";
import Link from "next/link";
import { Crown, FileCheck2, MessageCircleQuestion, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { claimDailyBriefing } from "@/actions/briefing";
import { markNotificationRead } from "@/actions/notifications";
import { BRIEFING_LABEL, type Briefing, type BriefingBucket } from "@/lib/daily-briefing";
import { formatDue } from "@/lib/time";
import { cn, taskRef } from "@/lib/utils";
import { PriorityIcon } from "@/components/tasks/badges";
import type { TaskPriorityKey } from "@/components/tasks/meta";
import { useNotifications } from "./notification-bell";

/** Fire this to show today's summary again (the "Today's plan" menu item). */
export const OPEN_BRIEFING_EVENT = "fr:open-briefing";

const TONE: Record<BriefingBucket, string> = {
  overdue: "text-danger",
  today: "text-warning",
  tomorrow: "text-brand",
  dayAfter: "text-brand",
  week: "text-fg-muted",
  later: "text-fg-subtle",
};

/** How many tasks to list per day before summarising the rest. */
const PER_GROUP = 5;

/**
 * The first page someone opens on a new day pops up a short summary of what
 * needs doing today, tomorrow, the day after and later. It's also filed in
 * their inbox, and can be reopened from the account menu.
 */
export function DailyBriefing() {
  const { refresh } = useNotifications();
  const [briefing, setBriefing] = React.useState<Briefing | null>(null);
  const [open, setOpen] = React.useState(false);
  const claimed = React.useRef(false);

  React.useEffect(() => {
    if (claimed.current) return;
    claimed.current = true;
    claimDailyBriefing()
      .then((b) => {
        if (!b) return;
        setBriefing(b);
        setOpen(true);
        void refresh();
      })
      .catch(() => {});
  }, [refresh]);

  React.useEffect(() => {
    const reopen = () => {
      claimDailyBriefing(true)
        .then((b) => {
          if (!b) return;
          setBriefing(b);
          setOpen(true);
        })
        .catch(() => {});
    };
    window.addEventListener(OPEN_BRIEFING_EVENT, reopen);
    return () => window.removeEventListener(OPEN_BRIEFING_EVENT, reopen);
  }, []);

  const close = () => {
    setOpen(false);
    if (briefing?.notificationId) {
      void markNotificationRead(briefing.notificationId).then(() => refresh());
    }
  };

  if (!briefing) return null;
  const now = new Date();
  const nothing = briefing.groups.length === 0 && briefing.toReview.length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent
        size="md"
        title={
          <span className="inline-flex items-center gap-2">
            <Sun className="size-[18px] text-warning" /> Your day at a glance
          </span>
        }
        description={briefing.headline}
      >
        {nothing ? (
          <p className="py-4 text-center text-[13.5px] text-fg-muted">Nothing is assigned to you right now. Enjoy the clear runway.</p>
        ) : (
          <div className="space-y-5">
            {briefing.updatesRequested > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl border border-info/25 bg-info-soft/60 px-3 py-2.5 text-[13px]">
                <MessageCircleQuestion className="size-4 shrink-0 text-info" />
                {briefing.updatesRequested === 1 ? "Someone is waiting for an update from you." : `${briefing.updatesRequested} updates have been requested from you.`}
              </div>
            )}

            {briefing.groups.map((g) => (
              <section key={g.bucket}>
                <h3 className={cn("mb-1.5 flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-wider", TONE[g.bucket])}>
                  {BRIEFING_LABEL[g.bucket]}
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-fg-muted">{g.tasks.length}</span>
                </h3>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {g.tasks.slice(0, PER_GROUP).map((t) => (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}`} onClick={close} className="flex items-center gap-2.5 px-3 py-2.5 transition hover:bg-surface-hover">
                        <PriorityIcon priority={t.priority as TaskPriorityKey} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">
                            <span className="mr-1.5 font-mono text-[11.5px] text-fg-subtle">{taskRef(t.number)}</span>
                            {t.title}
                          </span>
                          <span className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
                            {formatDue(new Date(t.dueAt), briefing.tz, now)}
                            {t.isLead && (
                              <span className="inline-flex items-center gap-0.5 font-semibold text-brand">
                                <Crown className="size-3" /> You lead
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                  {g.tasks.length > PER_GROUP && (
                    <li className="px-3 py-2 text-[12px] text-fg-muted">
                      and {g.tasks.length - PER_GROUP} more —{" "}
                      <Link href="/tasks" onClick={close} className="font-medium text-brand hover:underline">
                        see all tasks
                      </Link>
                    </li>
                  )}
                </ul>
              </section>
            ))}

            {briefing.toReview.length > 0 && (
              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-info">
                  <FileCheck2 className="size-3.5" /> Waiting for your review
                </h3>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {briefing.toReview.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tasks/${t.id}#submissions`} onClick={close} className="block truncate px-3 py-2.5 text-[13.5px] font-medium transition hover:bg-surface-hover">
                        <span className="mr-1.5 font-mono text-[11.5px] text-fg-subtle">{taskRef(t.number)}</span>
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
        <DialogFooter>
          <Button asChild variant="secondary">
            <Link href="/tasks" onClick={close}>
              Open my tasks
            </Link>
          </Button>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
