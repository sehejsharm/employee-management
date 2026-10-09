import { db } from "@/lib/db";
import type { AccountSource, EmploymentStatus, Role } from "@/generated/prisma/enums";
import { generateTemporaryPassword, hashPassword, isBcryptHash } from "@/lib/auth/password";
import { isEmployeeCode, nextEmployeeCode, normaliseEmployeeCode } from "@/lib/employee-code";
import { defaultGrants } from "@/lib/permissions";
import { hueFor } from "@/lib/utils";

/**
 * Account creation and credential changes. Shared by the People screen (a
 * founder adding someone by hand) and the HR console webhook, so both paths
 * produce identical accounts.
 */

export interface CredentialInput {
  /** A plaintext password chosen by the caller. Hashed immediately, never stored or logged. */
  password?: string;
  /** A bcrypt hash computed by the caller — the plaintext never reaches this app. */
  passwordHash?: string;
  mustChangePassword?: boolean;
}

export interface ResolvedCredentials {
  passwordHash: string;
  mustChangePassword: boolean;
  /** Present only when this app generated the password; show it once, then discard. */
  generatedPassword: string | null;
}

export async function resolveCredentials(input?: CredentialInput): Promise<ResolvedCredentials> {
  const mustChangePassword = input?.mustChangePassword ?? true;
  if (input?.passwordHash) {
    if (!isBcryptHash(input.passwordHash)) throw new AccountError("passwordHash must be a bcrypt hash ($2a$/$2b$/$2y$).");
    return { passwordHash: input.passwordHash, mustChangePassword, generatedPassword: null };
  }
  if (input?.password) {
    if (input.password.length < 8) throw new AccountError("Passwords must be at least 8 characters.");
    return { passwordHash: await hashPassword(input.password), mustChangePassword, generatedPassword: null };
  }
  const generated = generateTemporaryPassword();
  return { passwordHash: await hashPassword(generated), mustChangePassword: true, generatedPassword: generated };
}

export class AccountError extends Error {}

export interface NewAccount {
  email: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  role: Role;
  title?: string | null;
  phone?: string | null;
  location?: string | null;
  departmentId?: string | null;
  managerId?: string | null;
  joinedAt?: Date | null;
  status?: EmploymentStatus;
  source: AccountSource;
  externalId?: string | null;
  credentials?: CredentialInput;
}

export async function createAccount(input: NewAccount) {
  const email = input.email.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new AccountError(`An account already uses ${email}.`);
  }

  let employeeCode = input.employeeCode ? normaliseEmployeeCode(input.employeeCode) : await nextEmployeeCode();
  if (!isEmployeeCode(employeeCode)) throw new AccountError(`"${employeeCode}" is not a valid employee ID (e.g. FR-0042).`);
  if (await db.user.findUnique({ where: { employeeCode }, select: { id: true } })) {
    if (input.employeeCode) throw new AccountError(`Employee ID ${employeeCode} is already taken.`);
    employeeCode = await nextEmployeeCode();
  }

  const creds = await resolveCredentials(input.credentials);
  const user = await db.user.create({
    data: {
      email,
      employeeCode,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      role: input.role,
      ...defaultGrants(input.role),
      title: input.title?.trim() || null,
      phone: input.phone?.trim() || null,
      location: input.location?.trim() || null,
      departmentId: input.departmentId || null,
      managerId: input.managerId || null,
      joinedAt: input.joinedAt ?? new Date(),
      status: input.status ?? "ACTIVE",
      source: input.source,
      externalId: input.externalId ?? null,
      avatarHue: hueFor(email),
      passwordHash: creds.passwordHash,
      mustChangePassword: creds.mustChangePassword,
    },
    select: { id: true, employeeCode: true, email: true, firstName: true, lastName: true },
  });

  return { user, generatedPassword: creds.generatedPassword };
}

/** Replaces someone's password and signs them out everywhere. */
export async function setPassword(userId: string, credentials?: CredentialInput) {
  const creds = await resolveCredentials(credentials);
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        passwordHash: creds.passwordHash,
        mustChangePassword: creds.mustChangePassword,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    db.session.deleteMany({ where: { userId } }),
  ]);
  return { generatedPassword: creds.generatedPassword };
}

/** Finds a department by name, creating it on first use (HR sends names, not ids). */
export async function departmentIdByName(name: string | undefined | null) {
  const clean = name?.trim();
  if (!clean) return null;
  const existing = await db.department.findFirst({
    where: { name: { equals: clean, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await db.department.create({ data: { name: clean }, select: { id: true } });
  return created.id;
}

export function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}
