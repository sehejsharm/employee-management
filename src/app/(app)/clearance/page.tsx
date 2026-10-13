import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Inbox, KeyRound, Send, ShieldCheck, ShieldQuestion, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { AnswerButtons, DecideButtons, GrantForm, RequestForm, RevokeButton, WithdrawButton } from "@/components/clearance/clearance-client";
import { FadeIn } from "@/components/motion";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { activeClearanceWhere } from "@/lib/clearance";
import { db } from "@/lib/db";
import { isFounder } from "@/lib/permissions";
import { formatDate, timeAgo } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";

export const metadata: Metadata = { title: "Clearance" };

const person = { id: true, firstName: true, lastName: true, avatarHue: true, title: true } as const;

/**
 * Who can see whose work. Everyone sees who can see theirs and answers
 * requests about it; founders approve, grant and revoke.
 */
export default async function ClearancePage() {
  const user = await requireUser();
  const tz = await getTimeZone();
  const founder = isFounder(user);
  const active = activeClearanceWhere();

  const [mine, onMe, asksOfMe, myRequests, colleagues, pendingAll, activeAll] = await Promise.all([
    db.clearance.findMany({ where: { viewerId: user.id, ...active }, orderBy: { createdAt: "desc" }, select: { id: true, expiresAt: true, subject: { select: person } } }),
    db.clearance.findMany({
      where: { subjectId: user.id, ...active },
      orderBy: { createdAt: "desc" },
      select: { id: true, expiresAt: true, createdAt: true, viewer: { select: person }, grantedBy: { select: { firstName: true, lastName: true } } },
    }),
    db.clearanceRequest.findMany({
      where: { subjectId: user.id, status: "PENDING", subjectConsent: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, reason: true, createdAt: true, requester: { select: person } },
    }),
    founder
      ? Promise.resolve([])
      : db.clearanceRequest.findMany({
          where: { requesterId: user.id },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: { id: true, status: true, reason: true, createdAt: true, subjectConsent: true, founderApproved: true, subject: { select: person } },
        }),
    db.user.findMany({
      where: { status: { not: "INACTIVE" }, role: { not: "FOUNDER" }, id: { not: user.id } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: person,
    }),
    founder
      ? db.clearanceRequest.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            reason: true,
            createdAt: true,
            subjectConsent: true,
            founderApproved: true,
            requester: { select: person },
            subject: { select: person },
          },
        })
      : Promise.resolve([]),
    founder
      ? db.clearance.findMany({
          where: active,
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { id: true, expiresAt: true, createdAt: true, note: true, viewer: { select: person }, subject: { select: person }, grantedBy: { select: { firstName: true } } },
        })
      : Promise.resolve([]),
  ]);

  const clearedIds = new Set(mine.map((c) => c.subject.id));
  const requestable = colleagues.filter((p) => !clearedIds.has(p.id));
  const until = (d: Date | null) => (d ? `until ${formatDate(d, tz)}` : "no end date");

  return (
    <FadeIn>
      <PageHeader
        eyebrow="Company"
        title="Clearance"
        description="Seeing anyone else's work needs clearance from a founder. Founders' work is visible to founders alone."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {founder && (
            <Card>
              <CardHeader
                icon={<ShieldQuestion />}
                title="Waiting for a founder"
                description={pendingAll.length ? `${pendingAll.length} request${pendingAll.length === 1 ? "" : "s"} to decide` : "Nothing to decide."}
              />
              {pendingAll.length > 0 && (
                <CardBody className="space-y-3">
                  {pendingAll.map((r) => (
                    <div key={r.id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                        <Avatar person={r.requester} size="sm" />
                        <span className="font-medium">
                          {r.requester.firstName} {r.requester.lastName}
                        </span>
                        <span className="text-fg-muted">wants to see</span>
                        <Avatar person={r.subject} size="sm" />
                        <span className="font-medium">
                          {r.subject.firstName} {r.subject.lastName}
                        </span>
                        <span className="text-xs text-fg-subtle" suppressHydrationWarning>
                          · {timeAgo(r.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-[13.5px] text-fg-muted">“{r.reason}”</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <ConsentBadge consent={r.subjectConsent} name={r.subject.firstName} />
                        {r.founderApproved ? <Badge tone="success">You approved · waiting on {r.subject.firstName}</Badge> : <DecideButtons requestId={r.id} />}
                      </div>
                    </div>
                  ))}
                </CardBody>
              )}
            </Card>
          )}

          <Card>
            <CardHeader icon={<Inbox />} title="Requests to see your work" description={asksOfMe.length ? "Your answer goes to the founders, who make the final call." : "No one is asking right now."} />
            {asksOfMe.length > 0 && (
              <CardBody className="space-y-3">
                {asksOfMe.map((r) => (
                  <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Avatar person={r.requester} size="md" />
                      <div className="min-w-0">
                        <p className="text-[13.5px]">
                          <span className="font-medium">
                            {r.requester.firstName} {r.requester.lastName}
                          </span>{" "}
                          is asking to see your work{" "}
                          <span className="text-fg-subtle" suppressHydrationWarning>
                            · {timeAgo(r.createdAt)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[13px] text-fg-muted">“{r.reason}”</p>
                      </div>
                    </div>
                    <AnswerButtons requestId={r.id} />
                  </div>
                ))}
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader icon={<Eye />} title="Who can see your work" description={onMe.length ? undefined : "Only you, the people on your tasks, and the founders."} />
            {onMe.length > 0 && (
              <CardBody>
                <ul className="divide-y divide-line">
                  {onMe.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2.5">
                      <Avatar person={c.viewer} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">
                        <span className="font-medium">
                          {c.viewer.firstName} {c.viewer.lastName}
                        </span>{" "}
                        <span className="text-fg-subtle">
                          · cleared by {c.grantedBy.firstName}, {until(c.expiresAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            )}
          </Card>

          {founder && (
            <Card>
              <CardHeader icon={<KeyRound />} title="Active clearances" description={activeAll.length ? `${activeAll.length} in place` : "None yet."} />
              {activeAll.length > 0 && (
                <CardBody className="px-2 sm:px-3">
                  <ul className="divide-y divide-line">
                    {activeAll.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2 px-2 py-2.5 text-[13.5px]">
                        <Avatar person={c.viewer} size="xs" />
                        <span className="font-medium">
                          {c.viewer.firstName} {c.viewer.lastName}
                        </span>
                        <span className="text-fg-subtle">can see</span>
                        <Avatar person={c.subject} size="xs" />
                        <Link href={`/people/${c.subject.id}`} className="font-medium hover:text-brand">
                          {c.subject.firstName} {c.subject.lastName}
                        </Link>
                        <span className="text-xs text-fg-subtle">
                          · {until(c.expiresAt)} · by {c.grantedBy.firstName}
                        </span>
                        <span className="ml-auto">
                          <RevokeButton clearanceId={c.id} name={c.viewer.firstName} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          {founder ? (
            <Card>
              <CardHeader icon={<ShieldCheck />} title="Give clearance" description="Without waiting for a request." />
              <CardBody>
                <GrantForm people={colleagues} />
              </CardBody>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader icon={<Send />} title="Ask to see someone's work" description="Needs their yes and a founder's." />
                <CardBody>
                  <RequestForm people={requestable} />
                </CardBody>
              </Card>

              <Card>
                <CardHeader icon={<UsersRound />} title="Your clearances" description={mine.length ? undefined : "You don't have clearance for anyone yet."} />
                {mine.length > 0 && (
                  <CardBody>
                    <ul className="space-y-1">
                      {mine.map((c) => (
                        <li key={c.id}>
                          <Link href={`/people/${c.subject.id}`} className="group flex items-center gap-3 rounded-lg p-1.5 transition hover:bg-surface-hover">
                            <Avatar person={c.subject} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium group-hover:text-brand">
                                {c.subject.firstName} {c.subject.lastName}
                              </span>
                              <span className="block text-xs text-fg-subtle">{until(c.expiresAt)}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                )}
              </Card>

              {myRequests.length > 0 && (
                <Card>
                  <CardHeader title="Your requests" />
                  <CardBody>
                    <ul className="space-y-3">
                      {myRequests.map((r) => (
                        <li key={r.id} className="flex items-start gap-3">
                          <Avatar person={r.subject} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13.5px] font-medium">
                              {r.subject.firstName} {r.subject.lastName}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <RequestStatus status={r.status} consent={r.subjectConsent} founder={r.founderApproved} name={r.subject.firstName} />
                              {r.status === "PENDING" && <WithdrawButton requestId={r.id} />}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </aside>
      </div>
    </FadeIn>
  );
}

function ConsentBadge({ consent, name }: { consent: boolean | null; name: string }) {
  if (consent === null) return <Badge tone="neutral">Waiting on {name}</Badge>;
  return consent ? <Badge tone="success">{name} agreed</Badge> : <Badge tone="danger">{name} declined</Badge>;
}

function RequestStatus({ status, consent, founder, name }: { status: string; consent: boolean | null; founder: boolean | null; name: string }) {
  if (status === "APPROVED") return <Badge tone="success">Clearance given</Badge>;
  if (status === "DECLINED") return <Badge tone="danger">No clearance given</Badge>;
  if (status === "WITHDRAWN") return <Badge tone="neutral">Withdrawn</Badge>;
  const waits = [consent === null ? name : null, founder === null ? "a founder" : null].filter(Boolean).join(" and ");
  return <Badge tone="info">Waiting on {waits || "a founder"}</Badge>;
}
