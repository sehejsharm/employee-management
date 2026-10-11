"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword, passwordProblems } from "@/lib/auth/password";
import { startSession, endSession, currentSessionTokenHash, revokeAllSessions } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/current-user";
import { normaliseEmployeeCode } from "@/lib/employee-code";
import { audit } from "@/lib/audit";
import { AccountError, createAccount, departmentIdByName } from "@/lib/accounts";
import { SETUP_LOCK_KEY, setupTokenMatches } from "@/lib/setup";

export interface AuthFormState {
  error?: string;
  field?: "identifier" | "password" | "confirm" | "token" | "firstName" | "email";
}

const UNREACHABLE = "We can't reach the workspace right now. Try again in a minute — if it keeps happening, tell a founder.";

function clientIp(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

/** Best-effort per-IP throttle on top of the per-account lockout. */
const ipAttempts = new Map<string, { count: number; resetAt: number }>();
function ipThrottled(ip: string) {
  const now = Date.now();
  const entry = ipAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 30;
}

/** Only same-site relative paths are honoured as post-login destinations. */
function safeNext(value: FormDataEntryValue | null) {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/dashboard";
}

export async function login(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  const next = safeNext(formData.get("next"));

  if (!identifier) return { error: "Enter your employee ID or work email.", field: "identifier" };
  if (!password) return { error: "Enter your password.", field: "password" };

  if (ipThrottled(clientIp(await headers()))) return { error: "Too many sign-in attempts from this network. Wait a few minutes and try again." };

  let destination: string;
  try {
    const result = await authenticate(identifier, password, remember);
    if (!("mustChangePassword" in result)) return result;
    destination = result.mustChangePassword ? "/welcome" : next;
  } catch (error) {
    // Database down, paused or not migrated: keep the form and say so, rather than losing the page.
    console.error("Sign-in failed: database unavailable", error);
    return { error: UNREACHABLE };
  }
  redirect(destination);
}

async function authenticate(identifier: string, password: string, remember: boolean): Promise<AuthFormState | { mustChangePassword: boolean }> {
  const where = identifier.includes("@")
    ? { email: identifier.toLowerCase() }
    : { employeeCode: normaliseEmployeeCode(identifier) };

  const user = await db.user.findUnique({
    where,
    select: { id: true, passwordHash: true, status: true, lockedUntil: true, failedLoginCount: true, mustChangePassword: true },
  });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `This account is locked after too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  const valid = await verifyPassword(password, user?.passwordHash);

  if (!user || !valid) {
    if (user) {
      const failed = user.failedLoginCount + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
        },
      });
    }
    // One message for unknown IDs and wrong passwords, so the form never confirms who has an account.
    return { error: "That ID and password don't match our records.", field: "password" };
  }

  if (user.status === "INACTIVE") {
    return { error: "This account is no longer active. If you think that's a mistake, contact HR." };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await startSession(user.id, remember);
  return { mustChangePassword: user.mustChangePassword };
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function choosePassword(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const problems = passwordProblems(password);
  if (problems.length) return { error: `Your password needs: ${problems.join(", ").toLowerCase()}.`, field: "password" };
  if (password !== confirm) return { error: "The two passwords don't match.", field: "confirm" };

  const current = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (await verifyPassword(password, current?.passwordHash)) {
    return { error: "Choose a password different from your temporary one.", field: "password" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false, passwordChangedAt: new Date() },
  });
  await revokeAllSessions(user.id, await currentSessionTokenHash());
  await audit({ actorId: user.id, action: "account.password_set", targetType: "user", targetId: user.id, summary: "Chose a password on first sign-in" });
  redirect("/dashboard?welcome=1");
}

class SetupClosed extends Error {}

/**
 * First-run setup: creates the very first founder on a fresh database.
 * Requires SETUP_TOKEN (set in the host's environment) and works only while no
 * founder exists — an advisory lock makes concurrent attempts queue, so exactly
 * one can ever succeed. After that, /setup is a 404 and this action refuses.
 */
export async function setupWorkspace(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (ipThrottled(clientIp(await headers()))) return { error: "Too many attempts from this network. Wait a few minutes and try again." };

  if (!setupTokenMatches(String(formData.get("token") ?? ""))) {
    return { error: "That setup token doesn't match the SETUP_TOKEN set for this deployment.", field: "token" };
  }

  const firstName = String(formData.get("firstName") ?? "").trim().slice(0, 60);
  const lastName = String(formData.get("lastName") ?? "").trim().slice(0, 60);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const title = String(formData.get("title") ?? "").trim().slice(0, 80) || "Co-founder";
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!firstName) return { error: "Enter your first name.", field: "firstName" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter your work email.", field: "email" };
  const problems = passwordProblems(password);
  if (problems.length) return { error: `Your password needs: ${problems.join(", ").toLowerCase()}.`, field: "password" };
  if (password !== confirm) return { error: "The two passwords don't match.", field: "confirm" };

  // Hash before taking the lock, so the transaction holds it only for the inserts.
  const passwordHash = await hashPassword(password);
  let userId: string;
  try {
    // Everything runs on the transaction's own connection: the lock covers the
    // founder check and the inserts, and the whole setup commits or none of it does.
    userId = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY}::bigint)`;
        if (await tx.user.count({ where: { role: "FOUNDER" } })) throw new SetupClosed();
        const { user } = await createAccount(
          {
            email,
            firstName,
            lastName,
            title,
            role: "FOUNDER",
            departmentId: await departmentIdByName("Leadership", tx),
            source: "MANUAL",
            credentials: { passwordHash, mustChangePassword: false },
          },
          tx,
        );
        return user.id;
      },
      { timeout: 20_000, maxWait: 5_000 },
    );
  } catch (error) {
    if (error instanceof SetupClosed) return { error: "This workspace already has a founder. Sign in instead." };
    if (error instanceof AccountError) return { error: error.message, field: "email" };
    console.error("First-run setup failed", error);
    return { error: UNREACHABLE };
  }

  await audit({ actorId: userId, action: "workspace.setup", targetType: "user", targetId: userId, summary: "Created the first founder account" });
  await startSession(userId, true);
  redirect("/dashboard?welcome=1");
}
