import type { Metadata } from "next";
import Link from "next/link";
import { Award, Megaphone, Pin, Sparkles, Trophy } from "lucide-react";
import { GiveRecognitionDialog, RecognitionCard } from "@/components/recognition/recognition";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { mostRecognised, recognitionFeed } from "@/lib/recognition-feed";
import { PageHeader } from "@/components/app/page-header";
import { AnnouncementMenu, AnnouncementPdf, NewAnnouncement } from "@/components/app/announcement-client";
import { Stagger, StaggerItem } from "@/components/motion";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { RichText } from "@/components/ui/rich-text";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { isFounder, isLeader } from "@/lib/permissions";
import { formatDateTime, timeAgo } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";
import { cn, formatBytes } from "@/lib/utils";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const tz = await getTimeZone();
  const tab = (await searchParams).tab === "recognition" ? "recognition" : "news";
  const tabs = (
    <div className="mx-auto mb-6 flex max-w-3xl rounded-xl border border-line bg-surface-sunken p-0.5 xl:max-w-none">
      {(
        [
          ["news", "News", Megaphone, "/announcements"],
          ["recognition", "Recognition", Award, "/announcements?tab=recognition"],
        ] as const
      ).map(([key, label, Icon, href]) => (
        <Link
          key={key}
          href={href}
          className={cn(
            "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[13.5px] font-medium transition",
            tab === key ? "border border-line bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg",
          )}
        >
          <Icon className="size-4" /> {label}
        </Link>
      ))}
    </div>
  );
  if (tab === "recognition") return <RecognitionWall user={user} tabs={tabs} />;
  const items = await db.announcement.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      body: true,
      pinned: true,
      pdfName: true,
      pdfSize: true,
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
      {tabs}
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
                {a.pdfName && <AnnouncementPdf id={a.id} name={a.pdfName} size={formatBytes(a.pdfSize ?? 0)} />}
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Recognition wall                                                           */
/* -------------------------------------------------------------------------- */

async function RecognitionWall({ user, tabs }: { user: Awaited<ReturnType<typeof requireUser>>; tabs: React.ReactNode }) {
  const [awards, kudos, people, top] = await Promise.all([
    recognitionFeed(user, { kind: "AWARD" }, 6),
    recognitionFeed(user, { kind: "KUDOS" }, 60),
    db.user.findMany({
      where: { status: { not: "INACTIVE" }, id: { not: user.id } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, title: true },
    }),
    mostRecognised(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="Recognition"
        description="Praise and awards for the people who made a difference — seen by the whole company."
        actions={
          <GiveRecognitionDialog
            people={people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, title: p.title }))}
            canAward={isLeader(user)}
          />
        }
      />
      {tabs}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          {awards.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                <Trophy className="size-4 text-warning" /> Wall of fame
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {awards.map((r) => (
                  <RecognitionCard key={r.id} r={r} compact />
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
              <Sparkles className="size-4 text-brand" /> Kudos
            </h2>
            {kudos.length === 0 ? (
              <EmptyState icon={<Sparkles />} title="No kudos yet" description="Be the first — tell someone what they did well." />
            ) : (
              <div className="space-y-3">
                {kudos.map((r) => (
                  <RecognitionCard key={r.id} r={r} />
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader icon={<Award />} title="Most recognised" description="The last 30 days." />
            <CardBody className="pt-3">
              {top.length === 0 ? (
                <p className="text-[13px] text-fg-subtle">No one yet this month.</p>
              ) : (
                <ol className="space-y-2">
                  {top.map((p, i) => {
                    return (
                      <li key={p.id}>
                        <Link href={`/people/${p.id}`} className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-surface-hover">
                          <span className="w-4 text-center text-[12px] font-semibold tabular text-fg-subtle">{i + 1}</span>
                          <Avatar person={p} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                              {p.firstName} {p.lastName}
                            </span>
                            <span className="block truncate text-[11.5px] text-fg-subtle">{p.title}</span>
                          </span>
                          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">{p.count}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
