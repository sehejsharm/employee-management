import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { NotificationBanner } from "@/components/app/notification-setup";
import { InboxList } from "@/components/app/inbox-list";
import { requireUser } from "@/lib/auth/current-user";
import { syncDeadlineAlertsFor } from "@/lib/notifications";
import { notificationFeed } from "@/lib/notification-feed";
import { getTimeZone } from "@/lib/tz.server";

export const metadata: Metadata = { title: "Inbox" };

export default async function NotificationsPage() {
  const user = await requireUser();
  await syncDeadlineAlertsFor(user.id);
  const [feed, tz] = await Promise.all([notificationFeed(user.id, 150), getTimeZone()]);
  return (
    <>
      <PageHeader eyebrow="Work" title="Inbox" description="Assignments, deadline reminders, update requests and replies — everything that needs you." />
      <div className="mx-auto max-w-3xl space-y-5">
        <NotificationBanner />
        <InboxList items={feed.items} tz={tz} now={new Date().toISOString()} />
      </div>
    </>
  );
}
