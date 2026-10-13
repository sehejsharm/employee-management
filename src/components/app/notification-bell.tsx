"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { Bell, BellRing, CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import type { FeedItem } from "@/lib/notification-feed";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { NotificationIcon } from "./notification-icon";

const POLL_MS = 60_000;

/** Meeting calls link straight to Google Meet: open those in a new tab, everything else in the app. */
const isExternal = (href: string) => /^https?:\/\//.test(href);
const URGENT = new Set(["TASK_DUE_SOON", "TASK_OVERDUE", "UPDATE_REQUESTED"]);

interface FeedState {
  items: FeedItem[];
  unread: number;
}

const NotificationsContext = React.createContext<{
  feed: FeedState;
  refresh: () => Promise<void>;
  markRead: (id: string) => void;
  markAll: () => void;
} | null>(null);

export function useNotifications() {
  const ctx = React.useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return ctx;
}

/**
 * Keeps the inbox fresh: polls every minute while the tab is visible and
 * immediately on focus. New arrivals become a toast, and — when the person has
 * allowed it and is in another tab — a system notification.
 */
export function NotificationsProvider({ initialUnread, children }: { initialUnread: number; children: React.ReactNode }) {
  const router = useRouter();
  const [feed, setFeed] = React.useState<FeedState>({ items: [], unread: initialUnread });
  const seen = React.useRef<Set<string> | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as FeedState;

      if (seen.current) {
        const fresh = data.items.filter((n) => !seen.current!.has(n.id) && !n.readAt);
        for (const n of fresh.slice(0, 3).reverse()) {
          const show = URGENT.has(n.kind) ? toast.warning : toast;
          show(n.title, {
            description: n.body ?? undefined,
            action: n.href
              ? {
                  label: isExternal(n.href) ? "Join" : "Open",
                  onClick: () => (isExternal(n.href!) ? window.open(n.href!, "_blank", "noopener") : router.push(n.href!)),
                }
              : undefined,
          });
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
            try {
              const sys = new Notification(n.title, { body: n.body ?? undefined, icon: "/icon.svg", tag: n.id });
              sys.onclick = () => {
                window.focus();
                if (n.href) {
                  if (isExternal(n.href)) window.open(n.href, "_blank", "noopener");
                  else router.push(n.href);
                }
              };
            } catch {}
          }
        }
        if (fresh.length) router.refresh();
      }
      seen.current = new Set(data.items.map((n) => n.id));
      setFeed(data);
    } catch {
      // Offline or a deploy in progress — the next poll will catch up.
    }
  }, [router]);

  React.useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const markRead = React.useCallback((id: string) => {
    setFeed((f) => {
      const target = f.items.find((n) => n.id === id);
      if (!target || target.readAt) return f;
      return {
        unread: Math.max(0, f.unread - 1),
        items: f.items.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      };
    });
    markNotificationRead(id);
  }, []);

  const markAll = React.useCallback(() => {
    setFeed((f) => ({ unread: 0, items: f.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) }));
    markAllNotificationsRead().then(() => router.refresh());
  }, [router]);

  return (
    <NotificationsContext.Provider value={{ feed, refresh, markRead, markAll }}>{children}</NotificationsContext.Provider>
  );
}

export function NotificationBell() {
  const { feed, markRead, markAll } = useNotifications();
  const [open, setOpen] = React.useState(false);
  const controls = useAnimationControls();
  const prevUnread = React.useRef(feed.unread);

  React.useEffect(() => {
    if (feed.unread > prevUnread.current) {
      controls.start({ rotate: [0, -16, 14, -10, 6, 0], transition: { duration: 0.7 } });
    }
    prevUnread.current = feed.unread;
  }, [feed.unread, controls]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${feed.unread ? `, ${feed.unread} unread` : ""}`} className="relative">
          <motion.span animate={controls} className="inline-flex origin-top">
            {feed.unread > 0 ? <BellRing /> : <Bell />}
          </motion.span>
          <AnimatePresence>
            {feed.unread > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 22 }}
                className="absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-bg tabular"
              >
                {feed.unread > 99 ? "99+" : feed.unread}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(400px,calc(100vw-1.5rem))]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-[14px] font-semibold">Notifications</div>
            <div className="text-xs text-fg-subtle">{feed.unread ? `${feed.unread} unread` : "You're all caught up"}</div>
          </div>
          {feed.unread > 0 && (
            <Button variant="ghost" size="xs" onClick={markAll}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[min(460px,60dvh)] overflow-y-auto p-1.5">
          {feed.items.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Inbox className="size-6 text-fg-subtle" />
              <p className="mt-2 text-[13px] text-fg-muted">Nothing here yet.</p>
            </div>
          ) : (
            feed.items.slice(0, 12).map((n) => <FeedRow key={n.id} item={n} onOpen={() => { markRead(n.id); setOpen(false); }} />)
          )}
        </div>
        <div className="border-t border-line p-1.5">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex h-9 items-center justify-center rounded-lg text-[13px] font-medium text-brand transition hover:bg-surface-hover"
          >
            Open inbox
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FeedRow({ item, onOpen }: { item: FeedItem; onOpen: () => void }) {
  const content = (
    <div className={cn("group relative flex gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-hover")}>
      <NotificationIcon kind={item.kind} />
      <div className="min-w-0 flex-1">
        <div className={cn("text-[13px] leading-snug", item.readAt ? "text-fg-muted" : "font-medium text-fg")}>{item.title}</div>
        {item.body && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-subtle">{item.body}</div>}
        <div className="mt-1 text-[11px] text-fg-subtle">{timeAgo(new Date(item.createdAt))}</div>
      </div>
      {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
    </div>
  );
  return item.href ? (
    <Link
      href={item.href}
      onClick={onOpen}
      className="block"
      {...(isExternal(item.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      {content}
    </button>
  );
}
