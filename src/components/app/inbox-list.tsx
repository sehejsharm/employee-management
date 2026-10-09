"use client";

import * as React from "react";
import { CheckCheck, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import type { FeedItem } from "@/lib/notification-feed";
import { FeedRow } from "./notification-bell";

const URGENT = ["TASK_DUE_SOON", "TASK_OVERDUE", "UPDATE_REQUESTED"];

export function InboxList({ items: initial }: { items: FeedItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [filter, setFilter] = React.useState<"all" | "unread" | "urgent">("all");
  React.useEffect(() => setItems(initial), [initial]);

  const shown = items.filter((n) => (filter === "unread" ? !n.readAt : filter === "urgent" ? URGENT.includes(n.kind) : true));
  const unread = items.filter((n) => !n.readAt).length;

  // Group by day for a calmer list.
  const groups = new Map<string, FeedItem[]>();
  for (const n of shown) {
    const d = new Date(n.createdAt);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    const key =
      d.toDateString() === today.toDateString()
        ? "Today"
        : d.toDateString() === yesterday.toDateString()
          ? "Yesterday"
          : d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
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
