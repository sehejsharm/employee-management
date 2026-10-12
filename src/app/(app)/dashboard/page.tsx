import type { Metadata } from "next";
import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Megaphone,
  MessageCircleQuestion,
  Pin,
  Sparkles,
  Telescope,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { FadeIn } from "@/components/motion";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RichText } from "@/components/ui/rich-text";
import { FocusEditor, NextDeadline, StatCard, WelcomeToast } from "@/components/dashboard/widgets";
import { TaskRow } from "@/components/tasks/task-row";
import { SharedEmailNotice } from "@/components/people/shared-email-notice";
import { sharingEmailWith } from "@/lib/shared-email";
import { requireUser } from "@/lib/auth/current-user";
import { getClearedIds } from "@/lib/clearance";
import { founderPulse, memberDashboard, missionControl } from "@/lib/dashboard";
import { MissionControl } from "@/components/mission/mission-control";
import { isFounder, isLeader } from "@/lib/permissions";
import { DUE_BUCKET_LABEL, dueBucket, formatLongDate, greeting, timeAgo, type DueBucket } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string; welcome?: string }> }) {
  const user = await requireUser();
  const tz = await getTimeZone();
  const params = await searchParams;
  const leader = isLeader(user);
  const view = leader && params.view !== "me" ? "team" : "me";
  const now = new Date();
  const emailSharers = await sharingEmailWith(user);

  return (
    <>
      <WelcomeToast show={params.welcome === "1"} />
      <PageHeader
        eyebrow={formatLongDate(now, tz)}
        title={
          <>
            {greeting(now, tz)}, <span className="text-gradient-brand">{user.firstName}</span>
          </>
        }
        description={
          view === "team"
            ? isFounder(user)
              ? "Here's the whole company's work — what's late, what's next, and who's carrying what."
              : "Here's your work and everyone you're cleared to see — what's late, what's next, and who's carrying what."
            : "Here's what's on your plate. Deadlines are in your local time."
        }
        actions={
          leader ? (
            <div className="inline-flex rounded-xl border border-line bg-surface-sunken p-0.5">
              {(
                [
                  ["team", isFounder(user) ? "Mission Control" : "My team", UsersRound],
                  ["me", "My work", ClipboardList],
                ] as const
              ).map(([key, label, Icon]) => (
                <Link
                  key={key}
                  href={key === "team" ? "/dashboard" : "/dashboard?view=me"}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium transition",
                    view === key ? "border border-line bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      {emailSharers.length > 0 && (
        <FadeIn delay={0.03} className="mb-6">
          <SharedEmailNotice self email={user.email} others={emailSharers} />
        </FadeIn>
      )}
      <FadeIn delay={0.05} className="mb-6">
        <FocusEditor initial={user.focus} />
      </FadeIn>
      {view === "team" ? <LeaderView tz={tz} /> : <MemberView tz={tz} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Employee / intern view                                                     */
/* -------------------------------------------------------------------------- */

async function MemberView({ tz }: { tz: string }) {
  const user = await requireUser();
  const data = await memberDashboard(user.id);
  const now = new Date();

  const groups = new Map<DueBucket, typeof data.rows>();
  for (const t of data.rows) {
    const b = dueBucket(new Date(t.dueAt), t.status, tz, now);
    groups.set(b, [...(groups.get(b) ?? []), t]);
  }
  const order: DueBucket[] = ["overdue", "today", "tomorrow", "week", "later"];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <NextDeadline tz={tz} task={data.next} />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <StatCard index={0} label="Open tasks" value={data.stats.open} icon={<ClipboardList />} href="/tasks" />
          <StatCard index={1} label="Due within a day" value={data.stats.dueSoon} icon={<AlarmClock />} tone="warning" />
          <StatCard index={2} label="Overdue" value={data.stats.overdue} icon={<TriangleAlert />} tone="danger" />
          <StatCard index={3} label="Done this week" value={data.stats.doneThisWeek} icon={<CheckCircle2 />} tone="success" />
        </div>
      </div>

      {data.requests.length > 0 && (
        <FadeIn delay={0.15}>
          <div className="overflow-hidden rounded-2xl border border-info/25 bg-info-soft/60">
            <div className="flex items-center gap-2 border-b border-info/15 px-5 py-3 text-[13px] font-semibold text-info">
              <MessageCircleQuestion className="size-4" /> {data.requests.length === 1 ? "An update has" : `${data.requests.length} updates have`} been requested from you
            </div>
            <ul>
              {data.requests.map((r) => (
                <li key={r.id} className="border-b border-info/10 last:border-0">
                  <Link href={`/tasks/${r.task.id}#post-update`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-info-soft">
                    <Avatar person={r.requestedBy} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px]">
                        <span className="font-medium">{r.requestedBy.firstName}</span> on{" "}
                        <span className="font-medium">T-{r.task.number} · {r.task.title}</span>
                      </p>
                      {r.message && <p className="truncate text-[12.5px] text-fg-muted">“{r.message}”</p>}
                    </div>
                    <span className="hidden text-xs text-fg-subtle sm:block" suppressHydrationWarning>
                      {timeAgo(r.createdAt)}
                    </span>
                    <span className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand px-3 text-xs font-medium text-brand-fg">
                      Reply <ArrowRight className="size-3.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </FadeIn>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<ClipboardList />}
            title="My work"
            description="Grouped by when it's due"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/tasks">
                  All tasks <ArrowRight />
                </Link>
              </Button>
            }
          />
          <CardBody className="space-y-5 px-2 sm:px-3">
            {data.rows.length === 0 ? (
              <EmptyState icon={<Sparkles />} title="Your list is clear" description="When a founder or your manager assigns you something, it'll appear here with its deadline." compact />
            ) : (
              order
                .filter((b) => groups.has(b))
                .map((b) => (
                  <div key={b}>
                    <div className={cn("mb-1 px-3 text-[11.5px] font-semibold uppercase tracking-wider", b === "overdue" ? "text-danger" : "text-fg-subtle")}>
                      {DUE_BUCKET_LABEL[b]}
                    </div>
                    <ul>
                      {groups.get(b)!.map((t, i) => (
                        <TaskRow key={t.id} task={t} tz={tz} index={i} canChangeStatus />
                      ))}
                    </ul>
                  </div>
                ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<Megaphone />}
            title="Announcements"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/announcements">
                  All <ArrowRight />
                </Link>
              </Button>
            }
          />
          <CardBody className="space-y-4">
            {data.announcements.length === 0 && <p className="text-[13px] text-fg-subtle">No announcements yet.</p>}
            {data.announcements.map((a) => (
              <article key={a.id} className="rounded-xl border border-line bg-surface-sunken/50 p-4">
                <div className="flex items-center gap-2">
                  {a.pinned && <Pin className="size-3.5 text-brand" />}
                  <h3 className="text-[14px] font-semibold leading-snug">{a.title}</h3>
                </div>
                <RichText text={a.body.length > 220 ? `${a.body.slice(0, 217)}…` : a.body} className="mt-1.5 text-[13px] text-fg-muted" />
                <div className="mt-3 flex items-center gap-2 text-xs text-fg-subtle">
                  <Avatar person={a.author} size="xs" />
                  {a.author.firstName} · <span suppressHydrationWarning>{timeAgo(a.createdAt)}</span>
                </div>
              </article>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Founders / management view — Mission Control                               */
/* -------------------------------------------------------------------------- */

async function LeaderView({ tz }: { tz: string }) {
  const user = await requireUser();
  const cleared = await getClearedIds(user);
  const [data, pulse] = await Promise.all([missionControl(user, cleared, tz), isFounder(user) ? founderPulse() : Promise.resolve([])]);

  return (
    <div className="space-y-6">
      <MissionControl data={data} tz={tz} scopeLabel={isFounder(user) ? "Everything Focus Realm is working on, live" : "Your work and everyone you're cleared to see, live"} />

      {pulse.length > 0 && (
        <Card>
          <CardHeader
            icon={<Telescope />}
            title="Founders' focus"
            description="What each founder is driving right now"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/leadership" aria-label="Leadership board">
                  <span className="hidden sm:inline">Leadership board</span>
                  <span className="sm:hidden">Board</span> <ArrowRight />
                </Link>
              </Button>
            }
          />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            {pulse.map((f) => (
              <Link key={f.id} href="/leadership" className="flex gap-3 rounded-xl border border-line p-3 transition hover:border-brand/30 hover:bg-surface-hover">
                <Avatar person={f} size="md" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium">
                    {f.firstName} {f.lastName}
                  </p>
                  <p className="text-[12.5px] text-fg-muted">{f.focus ?? <span className="text-fg-subtle">No focus shared</span>}</p>
                </div>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
