import { z } from "zod";
import { closeOutAfterLeaving } from "@/lib/offboarding";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  AccountError,
  createAccount,
  departmentIdByName,
  setPassword,
  splitFullName,
} from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { config } from "@/lib/env";
import { notify } from "@/lib/notifications";
import { normaliseEmployeeCode } from "@/lib/employee-code";
import { fullName } from "@/lib/utils";
import { fileReportOnOffboarding } from "@/lib/work-report";
import { wouldCreateCycle } from "@/lib/org";
import { defaultGrants } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";
import { reportingEdges } from "@/lib/reporting";

/**
 * The HR console's provisioning contract. Every event is one JSON envelope:
 *
 *   { "id": "evt_…", "type": "employee.created", "createdAt": "…", "data": { … } }
 *
 * See docs/HR_CONSOLE_INTEGRATION.md for the full contract and the drop-in
 * client for the HR console.
 */

export const EVENT_TYPES = [
  "ping",
  "employee.created",
  "employee.updated",
  "employee.offboarded",
  "employee.restored",
  "employee.credentials_reset",
] as const;

const roleSchema = z.enum(["FOUNDER", "MANAGER", "EMPLOYEE", "INTERN"]);

const credentialsSchema = z
  .object({
    password: z.string().min(8).max(200).optional(),
    passwordHash: z.string().max(100).optional(),
    mustChangePassword: z.boolean().optional(),
  })
  .optional();

const employeeSchema = z.object({
  externalId: z.string().trim().min(1).max(120),
  employeeCode: z.string().trim().max(32).optional(),
  email: z.email().max(254).optional(),
  fullName: z.string().trim().min(1).max(120).optional(),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  role: roleSchema.optional(),
  title: z.string().trim().max(120).optional(),
  department: z.string().trim().max(60).optional(),
  managerEmail: z.email().optional(),
  managerEmployeeCode: z.string().trim().max(32).optional(),
  phone: z.string().trim().max(32).optional(),
  location: z.string().trim().max(80).optional(),
  startDate: z.string().optional(),
  /** Last working day (e.g. the end of an internship): their work report is filed that day. */
  endDate: z.string().optional(),
  credentials: credentialsSchema,
});

const envelopeSchema = z.object({
  id: z.string().trim().min(6).max(120),
  type: z.enum(EVENT_TYPES),
  createdAt: z.string().optional(),
  data: z.unknown().optional(),
});

export type HrEmployee = z.infer<typeof employeeSchema>;

export class HrEventError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

export interface HrResult {
  status: number;
  body: Record<string, unknown>;
}

function parseEmployee(data: unknown) {
  const parsed = employeeSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HrEventError(`Invalid employee payload: ${issue.path.join(".") || "data"} — ${issue.message}`);
  }
  return parsed.data;
}

function namesOf(e: HrEmployee) {
  if (e.firstName) return { firstName: e.firstName, lastName: e.lastName ?? "" };
  if (e.fullName) return splitFullName(e.fullName);
  return null;
}

/**
 * Founder accounts cannot be minted or changed through the webhook unless the
 * deployment opts in. A leaked HR secret should never yield the keys to everything.
 */
function founderProvisioningLocked() {
  return process.env.HR_ALLOW_FOUNDER_PROVISIONING !== "true";
}

function guardRole(role: HrEmployee["role"]) {
  if (role === "FOUNDER" && founderProvisioningLocked()) {
    throw new HrEventError("Founder accounts cannot be provisioned through the HR integration.", 403);
  }
}

/** The same lock for accounts that already exist: an HR event may never link to, rename or re-key a founder. */
function guardExistingFounder(user: { role: string }) {
  if (user.role === "FOUNDER" && founderProvisioningLocked()) {
    throw new HrEventError("Founder accounts cannot be linked or changed through the HR integration.", 403);
  }
}

async function managerIdFor(e: HrEmployee) {
  if (e.managerEmployeeCode) {
    const m = await db.user.findUnique({
      where: { employeeCode: normaliseEmployeeCode(e.managerEmployeeCode) },
      select: { id: true, status: true },
    });
    // Someone who has left can't be a manager.
    if (m && m.status !== "INACTIVE") return m.id;
  }
  if (e.managerEmail) {
    // Emails can be shared, so an email only identifies a manager when exactly one current person uses it.
    const matches = await db.user.findMany({
      where: { email: e.managerEmail.toLowerCase(), status: { not: "INACTIVE" } },
      select: { id: true },
      take: 2,
    });
    if (matches.length === 1) return matches[0].id;
  }
  return undefined;
}

function parseDate(value: string | undefined) {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : new Date(t);
}

function publicUser(u: { id: string; employeeCode: string; email: string }) {
  return { id: u.id, employeeCode: u.employeeCode, email: u.email, loginUrl: `${config.appUrl()}/login` };
}

async function findLinked(externalId: string) {
  return db.user.findUnique({ where: { externalId } });
}

async function upsertEmployee(e: HrEmployee): Promise<HrResult> {
  guardRole(e.role);
  const existing = await findLinked(e.externalId);

  if (!existing) {
    // An "updated" event for someone never seen creates them, so a missed
    // "created" delivery heals itself on the next change.
    if (!e.email) throw new HrEventError("email is required to create an account.");
    const names = namesOf(e);
    if (!names) throw new HrEventError("fullName (or firstName) is required to create an account.");

    // Someone a founder already added by hand: link by employee ID rather than duplicate.
    // Never by email — several employees can share one mailbox, so an email
    // match says nothing about which person this HR record is.
    if (e.employeeCode) {
      const byCode = await db.user.findUnique({ where: { employeeCode: normaliseEmployeeCode(e.employeeCode) } });
      if (byCode) {
        guardExistingFounder(byCode);
        if (byCode.externalId && byCode.externalId !== e.externalId) {
          throw new HrEventError(`Employee ID ${byCode.employeeCode} is already linked to a different HR record.`, 409);
        }
        await db.user.update({ where: { id: byCode.id }, data: { externalId: e.externalId } });
        return updateExisting(byCode, e, "linked");
      }
    }

    const { user, generatedPassword } = await createAccount({
      email: e.email,
      ...names,
      employeeCode: e.employeeCode,
      role: e.role ?? "INTERN",
      title: e.title,
      phone: e.phone,
      location: e.location,
      departmentId: await departmentIdByName(e.department),
      managerId: (await managerIdFor(e)) ?? null,
      joinedAt: parseDate(e.startDate) ?? new Date(),
      lastDay: parseDate(e.endDate) ?? null,
      source: "HR_CONSOLE",
      externalId: e.externalId,
      credentials: e.credentials,
    });

    await audit({
      actorId: null,
      action: "account.provisioned",
      targetType: "user",
      targetId: user.id,
      summary: `${fullName(user)} (${user.employeeCode}) was provisioned by the HR console`,
    });

    const admins = await db.user.findMany({
      where: { status: "ACTIVE", OR: [{ role: "FOUNDER" }, { canManagePeople: true }] },
      select: { id: true },
    });
    await notify(
      admins.map((a) => a.id),
      {
        kind: "SYSTEM",
        title: `${fullName(user)} joined the workspace`,
        body: `Provisioned from the HR console as ${user.employeeCode}.`,
        href: `/people/${user.id}`,
      },
    );

    return {
      status: 201,
      body: {
        ok: true,
        action: "created",
        user: publicUser(user),
        ...(generatedPassword
          ? { credentials: { loginId: user.employeeCode, email: user.email, temporaryPassword: generatedPassword } }
          : {}),
      },
    };
  }

  return updateExisting(existing, e, "updated");
}

async function updateExisting(
  existing: { id: string; role: string; email: string; employeeCode: string; emailSetManuallyAt: Date | null },
  e: HrEmployee,
  action: "updated" | "linked",
): Promise<HrResult> {
  guardExistingFounder(existing);
  if (existing.role === "FOUNDER" && e.role && e.role !== "FOUNDER") {
    throw new HrEventError("Founder accounts cannot be changed through the HR integration.", 403);
  }

  const names = namesOf(e);
  const data: Prisma.UserUpdateInput = {};
  if (names) {
    data.firstName = names.firstName;
    data.lastName = names.lastName;
  }
  // Shared emails are fine: the employee ID, not the email, identifies the account.
  // An email a founder or manager set in the Workspace wins over the HR console's.
  if (e.email && e.email.toLowerCase() !== existing.email && !existing.emailSetManuallyAt) data.email = e.email.toLowerCase();
  if (e.role && e.role !== existing.role) {
    // A new role brings that role's default powers: a demoted manager loses admin rights,
    // a promoted one can assign work.
    Object.assign(data, { role: e.role, ...defaultGrants(e.role as Role) });
  }
  if (e.title !== undefined) data.title = e.title || null;
  if (e.phone !== undefined) data.phone = e.phone || null;
  if (e.location !== undefined) data.location = e.location || null;
  if (e.department !== undefined) {
    const departmentId = await departmentIdByName(e.department);
    data.department = departmentId ? { connect: { id: departmentId } } : { disconnect: true };
  }
  const warnings: string[] = [];
  const managerId = await managerIdFor(e);
  if ((e.managerEmployeeCode || e.managerEmail) && !managerId) {
    warnings.push("Manager not found among current people; reporting line left unchanged.");
  } else if (managerId && managerId !== existing.id) {
    // Never create a loop (A reports to B while B reports to A).
    if (wouldCreateCycle(await reportingEdges(), existing.id, managerId)) {
      warnings.push("That manager reports (directly or indirectly) to this person; reporting line left unchanged.");
    } else {
      data.manager = { connect: { id: managerId } };
    }
  }
  const joinedAt = parseDate(e.startDate);
  if (joinedAt) data.joinedAt = joinedAt;
  const lastDay = parseDate(e.endDate);
  if (lastDay) data.lastDay = lastDay;

  const user = await db.user.update({
    where: { id: existing.id },
    data,
    select: { id: true, employeeCode: true, email: true },
  });

  // Credentials are only replaced when the HR console explicitly sends them.
  let generated: string | null = null;
  if (e.credentials && (e.credentials.password || e.credentials.passwordHash)) {
    ({ generatedPassword: generated } = await setPassword(user.id, e.credentials));
  }

  return {
    status: 200,
    body: {
      ok: true,
      action,
      user: publicUser(user),
      ...(warnings.length ? { warnings } : {}),
      ...(generated ? { credentials: { loginId: user.employeeCode, email: user.email, temporaryPassword: generated } } : {}),
    },
  };
}

async function setStatus(data: unknown, status: "ACTIVE" | "INACTIVE"): Promise<HrResult> {
  const ref = z.object({ externalId: z.string().min(1), leftOn: z.string().optional(), reason: z.string().optional() }).safeParse(data);
  if (!ref.success) throw new HrEventError("externalId is required.");
  const user = await findLinked(ref.data.externalId);
  if (!user) throw new HrEventError(`No account is linked to HR record ${ref.data.externalId}.`, 404);
  if (user.role === "FOUNDER") throw new HrEventError("Founder accounts cannot be changed through the HR integration.", 403);

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      // Leaving ends their work period (HR's leftOn date, else today) unless a last day is already set.
      data: {
        status,
        ...(status === "INACTIVE" && user.status !== "INACTIVE"
          ? { lastDay: user.lastDay ?? parseDate(ref.data.leftOn) ?? new Date() }
          : {}),
      },
    }),
    ...(status === "INACTIVE" ? [db.session.deleteMany({ where: { userId: user.id } })] : []),
  ]);

  if (status === "INACTIVE" && user.status !== "INACTIVE") {
    await fileReportOnOffboarding(user.id, null).catch((e) => console.error("offboarding report failed", e));
    await closeOutAfterLeaving(user.id);
  }
  await audit({
    actorId: null,
    action: status === "INACTIVE" ? "account.offboarded" : "account.restored",
    targetType: "user",
    targetId: user.id,
    summary:
      status === "INACTIVE"
        ? `${fullName(user)} was offboarded by the HR console${ref.data.reason ? ` (${ref.data.reason})` : ""}`
        : `${fullName(user)} was restored by the HR console`,
  });

  return {
    status: 200,
    body: { ok: true, action: status === "INACTIVE" ? "offboarded" : "restored", user: publicUser(user) },
  };
}

async function resetCredentials(data: unknown): Promise<HrResult> {
  const parsed = z.object({ externalId: z.string().min(1), credentials: credentialsSchema }).safeParse(data);
  if (!parsed.success) throw new HrEventError("externalId is required.");
  const user = await findLinked(parsed.data.externalId);
  if (!user) throw new HrEventError(`No account is linked to HR record ${parsed.data.externalId}.`, 404);
  if (user.role === "FOUNDER") throw new HrEventError("Founder accounts cannot be changed through the HR integration.", 403);

  const { generatedPassword } = await setPassword(user.id, parsed.data.credentials);
  await audit({
    actorId: null,
    action: "account.password_reset",
    targetType: "user",
    targetId: user.id,
    summary: `${fullName(user)}'s password was reset by the HR console`,
  });
  return {
    status: 200,
    body: {
      ok: true,
      action: "credentials_reset",
      user: publicUser(user),
      ...(generatedPassword
        ? { credentials: { loginId: user.employeeCode, email: user.email, temporaryPassword: generatedPassword } }
        : {}),
    },
  };
}

/** A redacted copy of the payload for the integration log — never credentials. */
function summarise(type: string, data: unknown) {
  if (!data || typeof data !== "object") return { type };
  const d = data as Record<string, unknown>;
  const keep = ["externalId", "employeeCode", "email", "fullName", "firstName", "lastName", "role", "title", "department", "reason"];
  const out: Record<string, unknown> = { type };
  for (const key of keep) if (d[key] !== undefined) out[key] = d[key];
  if (d.credentials) out.credentials = "[redacted]";
  return out;
}

/**
 * Applies one verified event. Idempotent on the event id: a retried delivery
 * of an event that already succeeded is acknowledged without re-applying it.
 */
export async function handleHrEvent(raw: unknown): Promise<HrResult> {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return { status: 400, body: { ok: false, error: `Invalid event: ${envelope.error.issues[0].message}` } };
  }
  const { id: eventId, type, data } = envelope.data;

  const prior = await db.integrationEvent.findUnique({ where: { eventId } });
  if (prior && prior.status === "processed") {
    // Already applied. Echo who it was about (never credentials) so a retrying sender can carry on.
    const user = prior.userId
      ? await db.user.findUnique({ where: { id: prior.userId }, select: { id: true, employeeCode: true, email: true } })
      : null;
    return { status: 200, body: { ok: true, duplicate: true, eventId, ...(user ? { user: publicUser(user) } : {}) } };
  }

  // A delivery that's still being applied must not be applied twice in parallel (e.g. two
  // different temporary passwords from one credentials reset). Claim the row atomically:
  // only a failed attempt, or one stuck in flight for over two minutes, can be retried.
  if (prior) {
    const claimed = await db.integrationEvent.updateMany({
      where: {
        eventId,
        OR: [{ status: "failed" }, { status: "received", updatedAt: { lt: new Date(Date.now() - 2 * 60_000) } }],
      },
      data: { status: "received", error: null },
    });
    if (claimed.count === 0) {
      return { status: 409, body: { ok: false, error: "This event is still being applied. Retry in a minute.", eventId } };
    }
  }

  const record = prior
    ? await db.integrationEvent.findUnique({ where: { eventId } })
    : await db.integrationEvent
        .create({ data: { source: "hr-console", eventId, type, status: "received", summary: summarise(type, data) as never } })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
          throw error;
        });

  if (!record) return { status: 200, body: { ok: true, duplicate: true, eventId } };

  try {
    let result: HrResult;
    switch (type) {
      case "ping":
        result = { status: 200, body: { ok: true, action: "pong", workspace: config.appUrl() } };
        break;
      case "employee.created":
      case "employee.updated":
        result = await upsertEmployee(parseEmployee(data));
        break;
      case "employee.offboarded":
        result = await setStatus(data, "INACTIVE");
        break;
      case "employee.restored":
        result = await setStatus(data, "ACTIVE");
        break;
      case "employee.credentials_reset":
        result = await resetCredentials(data);
        break;
    }

    const user = result.body.user as { id?: string } | undefined;
    await db.integrationEvent.update({
      where: { id: record.id },
      data: { status: "processed", userId: user?.id ?? null },
    });
    return { status: result.status, body: { ...result.body, eventId } };
  } catch (error) {
    const known = error instanceof HrEventError || error instanceof AccountError;
    const message = known ? error.message : "Internal error while applying the event.";
    if (!known) console.error("HR event failed", eventId, error);
    await db.integrationEvent.update({ where: { id: record.id }, data: { status: "failed", error: message } });
    const status = error instanceof HrEventError ? error.status : error instanceof AccountError ? 409 : 500;
    return { status, body: { ok: false, error: message, eventId } };
  }
}
