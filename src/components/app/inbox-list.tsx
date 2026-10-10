"use client";

import * as React from "react";
import { CheckCheck, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import type { FeedItem } from "@/lib/notification-feed";
import { useSyncedState } from "@/lib/hooks";
import { dayKey } from "@/lib/time";
import { FeedRow } from "./notification-bell";

const URGENT = ["TASK_DUE_SOON", "TASK_OVERDUE", "UPDATE_REQUESTED"];

export function InboxList({ items: initial, tz, now: nowIso }: { items: FeedItem[]; tz: string; now: string }) {
  const router = useRouter();
  const [items, setItems] = useSyncedState(initial);
  const [filter, setFilter] = React.useState<"all" | "unread" | "urgent">("all");

  const shown = items.filter((n) => (filter === "unread" ? !n.readAt : filter === "urgent" ? URGENT.includes(n.kind) : true));
  const unread = items.filter((n) => !n.readAt).length;

  // Group by calendar day in the viewer's time zone — computed from server-given values, so it hydrates cleanly.
  const now = new Date(nowIso);
  const today = dayKey(now, tz);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000), tz);
  const groups = new Map<string, FeedItem[]>();
  for (const n of shown) {
    const d = new Date(n.createdAt);
    const k = dayKey(d, tz);
    const key =
      k === today
        ? "Today"
        : k === yesterday
          ? "Yesterday"
          : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" }).format(d);
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Segmented
          layoutId="inbox-filter"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: `Unread${unread ? ` · ${unread}` : ""}` },
            { value: "urgent", label: "Deadlines & requests" },
          ]}
        />
        {unread > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
              await markAllNotificationsRead();
              router.refresh();
            }}
          >
            <CheckCheck /> Mark all read
          </Button>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={<Inbox />} title={filter === "all" ? "Your inbox is empty" : "Nothing here"} description="You're all caught up." />
        </div>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 px-1 text-[11.5px] font-semibold uppercase tracking-wider text-fg-subtle">{day}</h2>
              <div className="rounded-2xl border border-line bg-surface p-1.5 shadow-sm">
                {list.map((n) => (
                  <FeedRow
                    key={n.id}
                    item={n}
                    onOpen={() => {
                      if (!n.readAt) {
                        setItems((l) => l.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
                        markNotificationRead(n.id);
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
