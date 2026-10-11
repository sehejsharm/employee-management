"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth/current-user";
import { activeClearanceWhere } from "@/lib/clearance";
import { notify } from "@/lib/notifications";
import { audit } from "@/lib/audit";
import { isFounder } from "@/lib/permissions";
import { config } from "@/lib/env";
import { formatDate, isValidTimeZone } from "@/lib/time";
import { fullName, type ActionResult } from "@/lib/utils";

/**
 * Clearance to see a colleague's work. Asked for by anyone who isn't a founder;
 * needs a yes from the colleague AND a founder. Founders can also grant it
 * directly, and revoke it at any time. Founders' work can never be cleared.
 */

const NO_FOUNDER_WORK = "No clearance given — founders' work is visible only to other founders.";

/** Notifications are written once for their reader, so dates use the company's time zone. */
function companyTimeZone() {
  const tz = config.timeZone();
  return isValidTimeZone(tz) ? tz : "Asia/Kolkata";
}

async function activeFounderIds() {
  const founders = await db.user.findMany({ where: { role: "FOUNDER", status: { not: "INACTIVE" } }, select: { id: true } });
  return founders.map((f) => f.id);
}

async function hasActiveClearance(viewerId: string, subjectId: string) {
  return Boolean(await db.clearance.findFirst({ where: { viewerId, subjectId, ...activeClearanceWhere() }, select: { id: true } }));
}

/* -------------------------------------------------------------------------- */
/* Asking                                                                     */
/* -------------------------------------------------------------------------- */

const requestSchema = z.object({
  subjectId: z.string().min(1),
  reason: z.string().trim().min(10, "Say why you need to see their work (at least 10 characters).").max(1000),
});

export async function requestClearance(input: z.input<typeof requestSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (isFounder(user)) return { ok: false, error: "Founders can already see everyone's work." };
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  const { subjectId, reason } = parsed.data;
  if (subjectId === user.id) return { ok: false, error: "You can always see your own work." };

  const subject = await db.user.findUnique({ where: { id: subjectId }, select: { id: true, firstName: true, lastName: true, role: true, status: true } });
  if (!subject || subject.status === "INACTIVE") return { ok: false, error: "That person isn't in the workspace any more." };
  if (subject.role === "FOUNDER") return { ok: false, error: NO_FOUNDER_WORK };
  if (await hasActiveClearance(user.id, subjectId)) return { ok: false, error: `You already have clearance to see ${subject.firstName}'s work.` };

  const pending = await db.clearanceRequest.findFirst({ where: { requesterId: user.id, subjectId, status: "PENDING" }, select: { id: true } });
  if (pending) return { ok: false, error: `You've already asked — it's waiting on ${subject.firstName} and a founder.` };

  const request = await db.clearanceRequest.create({ data: { requesterId: user.id, subjectId, reason }, select: { id: true } });

  const who = fullName(user);
  await notify([subjectId], {
    kind: "CLEARANCE",
    actorId: user.id,
    href: "/clearance",
    title: `${who} is asking to see your work`,
    body: reason,
  });
  await notify(await activeFounderIds(), {
    kind: "CLEARANCE",
    actorId: user.id,
    href: "/clearance",
    title: `${who} is asking for clearance to see ${fullName(subject)}'s work`,
    body: reason,
  });
  await audit({ actorId: user.id, action: "clearance.requested", targetType: "user", targetId: subjectId, summary: `Asked to see ${fullName(subject)}'s work`, meta: { requestId: request.id } });

  refresh();
  return { ok: true, message: `Request sent to ${subject.firstName} and the founders.` };
}

export async function withdrawClearanceRequest(requestId: string): Promise<ActionResult> {
  const user = await requireUser();
  const updated = await db.clearanceRequest.updateMany({
    where: { id: requestId, requesterId: user.id, status: "PENDING" },
    data: { status: "WITHDRAWN" },
  });
  if (!updated.count) return { ok: false, error: "That request is no longer pending." };
  refresh();
  return { ok: true, message: "Request withdrawn." };
}

/* -------------------------------------------------------------------------- */
/* Answering: the colleague, then a founder                                   */
/* -------------------------------------------------------------------------- */

type Settled = "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN";

/**
 * Settles a request once its answers are in: declined if either side said no
 * (or the colleague has since become a founder), cleared once both said yes.
 * Each outcome is claimed with a conditional update, so two answers landing at
 * the same moment can't both act on it. Returns where the request ends up.
 */
async function settle(requestId: string): Promise<Settled | null> {
  const r = await db.clearanceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      requesterId: true,
      subjectId: true,
      subjectConsent: true,
      founderApproved: true,
      decidedById: true,
      requester: { select: { firstName: true, lastName: true } },
      subject: { select: { firstName: true, lastName: true, role: true } },
    },
  });
  if (!r) return null;
  if (r.status !== "PENDING") return r.status;
  const current = async () => (await db.clearanceRequest.findUnique({ where: { id: r.id }, select: { status: true } }))?.status ?? null;

  const founderSubject = r.subject.role === "FOUNDER";
  if (founderSubject || r.subjectConsent === false || r.founderApproved === false) {
    const { count } = await db.clearanceRequest.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "DECLINED" } });
    if (!count) return current();
    await notify([r.requesterId], {
      kind: "CLEARANCE",
      href: "/clearance",
      title: `No clearance given to see ${fullName(r.subject)}'s work`,
      body: founderSubject ? NO_FOUNDER_WORK : r.subjectConsent === false ? `${r.subject.firstName} declined.` : "A founder declined the request.",
    });
    return "DECLINED";
  }

  if (!r.subjectConsent || !r.founderApproved || !r.decidedById) return "PENDING";
  const grantedById = r.decidedById;
  const clearance = await db.$transaction(async (tx) => {
    const { count } = await tx.clearanceRequest.updateMany({
      where: { id: r.id, status: "PENDING", subjectConsent: true, founderApproved: true },
      data: { status: "APPROVED" },
    });
    if (!count) return null;
    await tx.clearance.updateMany({ where: { viewerId: r.requesterId, subjectId: r.subjectId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: grantedById } });
    const created = await tx.clearance.create({
      data: { viewerId: r.requesterId, subjectId: r.subjectId, grantedById, note: "Granted on request" },
      select: { id: true },
    });
    await tx.clearanceRequest.update({ where: { id: r.id }, data: { clearanceId: created.id } });
    return created;
  });
  if (!clearance) return current();

  await notify([r.requesterId], {
    kind: "CLEARANCE",
    href: `/people/${r.subjectId}`,
    title: `Clearance given: you can now see ${fullName(r.subject)}'s work`,
  });
  await notify([r.subjectId], {
    kind: "CLEARANCE",
    href: "/clearance",
    title: `${fullName(r.requester)} can now see your work`,
  });
  return "APPROVED";
}

const ALREADY_SETTLED = "That request has already been settled.";

export async function answerClearanceRequest(requestId: string, allow: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.clearanceRequest.findUnique({
    where: { id: requestId },
    select: { id: true, subjectId: true, status: true, requester: { select: { firstName: true } } },
  });
  if (!r || r.subjectId !== user.id) return { ok: false, error: "That request isn't yours to answer." };
  if (r.status !== "PENDING") return { ok: false, error: ALREADY_SETTLED };

  // Answered once, and only while the request is still open.
  const { count } = await db.clearanceRequest.updateMany({
    where: { id: r.id, status: "PENDING", subjectConsent: null },
    data: { subjectConsent: allow, subjectAnsweredAt: new Date() },
  });
  if (!count) return { ok: false, error: ALREADY_SETTLED };
  const outcome = await settle(r.id);
  refresh();
  if (!allow) return { ok: true, message: "Declined. No clearance will be given." };
  if (outcome === "APPROVED") return { ok: true, message: `Thanks — ${r.requester.firstName} can now see your work.` };
  if (outcome === "DECLINED") return { ok: true, message: "Thanks. It had already been declined, so no clearance was given." };
  return { ok: true, message: "Thanks — a founder makes the final call." };
}

const decisionSchema = z.object({ approve: z.boolean() });

export async function decideClearanceRequest(requestId: string, input: z.input<typeof decisionSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (!isFounder(user)) return { ok: false, error: "Only founders give clearance." };
  const { approve } = decisionSchema.parse(input);
  const r = await db.clearanceRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, subject: { select: { firstName: true, role: true } } } });
  if (!r) return { ok: false, error: "That request no longer exists." };
  if (r.status !== "PENDING") return { ok: false, error: ALREADY_SETTLED };

  // One founder decides; a second founder clicking at the same moment is told it's already done.
  const { count } = await db.clearanceRequest.updateMany({
    where: { id: r.id, status: "PENDING", founderApproved: null },
    data: { founderApproved: approve, decidedById: user.id, decidedAt: new Date() },
  });
  if (!count) return { ok: false, error: "Another founder has already decided this request." };
  await audit({ actorId: user.id, action: approve ? "clearance.approved" : "clearance.declined", targetType: "clearance_request", targetId: r.id, summary: `${approve ? "Approved" : "Declined"} a clearance request` });
  const outcome = await settle(r.id);
  refresh();
  if (!approve) return { ok: true, message: "Declined. No clearance given." };
  if (outcome === "APPROVED") return { ok: true, message: "Approved — clearance is active." };
  if (outcome === "DECLINED") {
    return { ok: true, message: r.subject.role === "FOUNDER" ? NO_FOUNDER_WORK : `${r.subject.firstName} had already declined, so no clearance was given.` };
  }
  return { ok: true, message: `Approved. It becomes active once ${r.subject.firstName} agrees.` };
}

/* -------------------------------------------------------------------------- */
/* Founders: granting and revoking directly                                   */
/* -------------------------------------------------------------------------- */

const grantSchema = z.object({
  viewerId: z.string().min(1, "Choose who gets clearance."),
  subjectIds: z.array(z.string().min(1)).min(1, "Choose whose work they can see.").max(100),
  days: z.number().int().min(0).max(365).default(0),
  note: z.string().trim().max(300).optional().default(""),
});

async function requireFounder(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isFounder(user)) throw new Error("Only founders manage clearance.");
  return user;
}

export async function grantClearance(input: z.input<typeof grantSchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (!isFounder(user)) return { ok: false, error: "Only founders give clearance." };
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  const { viewerId, days, note } = parsed.data;
  const subjectIds = [...new Set(parsed.data.subjectIds)].filter((id) => id !== viewerId);
  if (!subjectIds.length) return { ok: false, error: "Choose at least one other person." };

  const people = await db.user.findMany({
    where: { id: { in: [viewerId, ...subjectIds] } },
    select: { id: true, firstName: true, lastName: true, role: true, status: true },
  });
  const viewer = people.find((p) => p.id === viewerId);
  if (!viewer || viewer.status === "INACTIVE") return { ok: false, error: "That person isn't in the workspace any more." };
  if (viewer.role === "FOUNDER") return { ok: false, error: "Founders can already see everyone's work." };
  const subjects = people.filter((p) => subjectIds.includes(p.id));
  if (subjects.some((s) => s.role === "FOUNDER")) return { ok: false, error: NO_FOUNDER_WORK };
  if (subjects.length !== subjectIds.length) return { ok: false, error: "One of the people chosen no longer exists." };

  const now = new Date();
  const expiresAt = days ? new Date(now.getTime() + days * 86_400_000) : null;
  await db.$transaction([
    db.clearance.updateMany({ where: { viewerId, subjectId: { in: subjectIds }, revokedAt: null }, data: { revokedAt: now, revokedById: user.id } }),
    db.clearance.createMany({ data: subjectIds.map((subjectId) => ({ viewerId, subjectId, grantedById: user.id, note: note || null, expiresAt })) }),
    // The grant answers any open request for the same thing, so it can't be declined or re-approved later.
    db.clearanceRequest.updateMany({
      where: { requesterId: viewerId, subjectId: { in: subjectIds }, status: "PENDING" },
      data: { status: "APPROVED", founderApproved: true, decidedById: user.id, decidedAt: now },
    }),
  ]);

  const names = subjects.map((s) => s.firstName).join(", ");
  await notify([viewerId], {
    kind: "CLEARANCE",
    actorId: user.id,
    href: "/clearance",
    title: `${user.firstName} gave you clearance to see ${subjects.length === 1 ? `${fullName(subjects[0])}'s` : `${subjects.length} people's`} work`,
    body: expiresAt ? `Until ${formatDate(expiresAt, companyTimeZone(), { year: true })}. ${names}` : names,
  });
  await notify(subjectIds, { kind: "CLEARANCE", actorId: user.id, href: "/clearance", title: `${fullName(viewer)} can now see your work`, body: note || null });
  await audit({ actorId: user.id, action: "clearance.granted", targetType: "user", targetId: viewerId, summary: `Gave ${fullName(viewer)} clearance over ${names}`, meta: { subjectIds, expiresAt } });

  refresh();
  return { ok: true, message: `Clearance given to ${viewer.firstName}.` };
}

export async function revokeClearance(clearanceId: string): Promise<ActionResult> {
  let user: CurrentUser;
  try {
    user = await requireFounder();
  } catch {
    return { ok: false, error: "Only founders manage clearance." };
  }
  const c = await db.clearance.findUnique({
    where: { id: clearanceId },
    select: { id: true, revokedAt: true, viewerId: true, subjectId: true, subject: { select: { firstName: true, lastName: true } } },
  });
  if (!c || c.revokedAt) return { ok: false, error: "That clearance has already ended." };
  await db.clearance.update({ where: { id: c.id }, data: { revokedAt: new Date(), revokedById: user.id } });
  await notify([c.viewerId], { kind: "CLEARANCE", actorId: user.id, href: "/clearance", title: `Your clearance to see ${fullName(c.subject)}'s work has ended` });
  await audit({ actorId: user.id, action: "clearance.revoked", targetType: "clearance", targetId: c.id, summary: `Revoked clearance over ${fullName(c.subject)}` });
  refresh();
  return { ok: true, message: "Clearance revoked." };
}
