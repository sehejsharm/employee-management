import type { Metadata } from "next";
import { Megaphone, Pin } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { AnnouncementMenu, NewAnnouncement } from "@/components/app/announcement-client";
import { Stagger, StaggerItem } from "@/components/motion";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { RichText } from "@/components/ui/rich-text";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { isFounder, isLeader } from "@/lib/permissions";
import { formatDateTime, timeAgo } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const user = await requireUser();
  const tz = await getTimeZone();
  const items = await db.announcement.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      body: true,
      pinned: true,
      createdAt: true,
      authorId: true,
      author: { select: { firstName: true, lastName: true, title: true, avatarHue: true } },
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="Announcements"
        description="News and decisions from the founders and management."
        actions={isLeader(user) ? <NewAnnouncement /> : undefined}
      />
      {items.length === 0 ? (
        <EmptyState icon={<Megaphone />} title="No announcements yet" description="When leadership shares news, it lands here and in everyone's inbox." />
      ) : (
        <Stagger className="mx-auto max-w-3xl space-y-4">
          {items.map((a) => (
            <StaggerItem key={a.id}>
              <article
                className={cn(
                  "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm sm:p-6",
                  a.pinned ? "border-brand/30" : "border-line",
                )}
              >
                {a.pinned && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-400 via-brand-600 to-brand-800" />}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar person={a.author} size="md" />
                    <div>
                      <div className="text-[13.5px] font-medium">
                        {a.author.firstName} {a.author.lastName}
                      </div>
                      <div className="text-xs text-fg-subtle" title={formatDateTime(a.createdAt, tz)} suppressHydrationWarning>
                        {a.author.title} · {timeAgo(a.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {a.pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-soft-fg">
                        <Pin className="size-3" /> Pinned
                      </span>
                    )}
                    {(a.authorId === user.id || isFounder(user)) && <AnnouncementMenu id={a.id} pinned={a.pinned} />}
                  </div>
                </div>
                <h2 className="mt-4 text-[19px] font-semibold tracking-[-0.015em]">{a.title}</h2>
                <RichText text={a.body} className="mt-2 text-fg-muted" />
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  );
}
