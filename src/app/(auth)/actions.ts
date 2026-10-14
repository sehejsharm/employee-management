"use server";

import { isValidPhone } from "@/lib/phone";
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
  field?: "identifier" | "password" | "confirm" | "token" | "firstName" | "email" | "phone" | "location";
}

const UNREACHABLE = "We can't reach the workspace right now. Try again in a minute — if it keeps happening, tell a founder.";

/** The caller's IP. On Vercel `x-real-ip` is set by the platform (clients can't forge it); X-Forwarded-For is the fallback elsewhere. */
function clientIp(h: Headers) {
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
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

/**
 * Only same-site relative paths are honoured as post-login destinations. The value is
 * parsed as a URL (not prefix-matched), so tricks like "/\t/evil.com", backslashes or
 * control characters can't turn it into a link to another site.
 */
function safeNext(value: FormDataEntryValue | null) {
  const v = typeof value === "string" ? value : "";
  if (!v.startsWith("/") || /[\x00-\x20\x7f\\]/.test(v)) return "/dashboard";
  try {
    const base = "http://same-origin.invalid";
    const url = new URL(v, base);
    if (url.origin !== base) return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/dashboard";
  }
}

export async function login(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  const next = safeNext(formData.get("next"));

  if (!identifier) return { error: "Enter your employee ID.", field: "identifier" };
  // Emails are shared between colleagues, so they can never identify one account.
  if (identifier.includes("@")) {
    return { error: "Sign in with your employee ID (e.g. FR-0042), not your email — several people can share one email.", field: "identifier" };
  }
  if (!password) return { error: "Enter your password.", field: "password" };

  if (ipThrottled(clientIp(await headers()))) return { error: "Too many sign-in attempts from this network. Wait a few minutes and try again." };

  let destination: string;
  try {
    const result = await authenticate(identifier, password, remember);
    if (!("mustChangePassword" in result)) return result;
    destination = result.mustChangePassword ? "/welcome" : result.mustCompleteProfile ? "/complete-profile" : next;
  } catch (error) {
    // Database down, paused or not migrated: keep the form and say so, rather than losing the page.
    console.error("Sign-in failed: database unavailable", error);
    return { error: UNREACHABLE };
  }
  redirect(destination);
}

async function authenticate(identifier: string, password: string, remember: boolean): Promise<AuthFormState | { mustChangePassword: boolean; mustCompleteProfile: boolean }> {
  const user = await db.user.findUnique({
    where: { employeeCode: normaliseEmployeeCode(identifier) },
    select: { id: true, passwordHash: true, status: true, lockedUntil: true, failedLoginCount: true, mustChangePassword: true, mustCompleteProfile: true },
  });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `This account is locked after too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  const valid = await verifyPassword(password, user?.passwordHash);

  if (!user || !valid) {
    if (user) {
      // Counted atomically in the database, so parallel guesses can't all read the same count.
      const { failedLoginCount } = await db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      if (failedLoginCount >= MAX_FAILED) {
        await db.user.updateMany({
          where: { id: user.id, failedLoginCount: { gte: MAX_FAILED } },
          data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) },
        });
      }
    }
    // One message for unknown IDs and wrong passwords, so the form never confirms who has an account.
    return { error: "That ID and password don't match our records.", field: "password" };
  }

  if (user.status === "INACTIVE") {
    return { error: "This account is no longer active. If you think that's a mistake, contact HR." };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await startSession(user.id, remember);
  return { mustChangePassword: user.mustChangePassword, mustCompleteProfile: user.mustCompleteProfile };
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function choosePassword(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Only for replacing the temporary password on first sign-in. Changing a password
  // later goes through Settings, which asks for the current one.
  if (!user.mustChangePassword) redirect("/dashboard");

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

export async function completeProfile(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/welcome");
  if (!user.mustCompleteProfile) redirect("/dashboard");

  const phone = String(formData.get("phone") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  if (!isValidPhone(phone)) {
    return { error: "Enter a valid phone number, e.g. +91 98765 43210.", field: "phone" };
  }
  if (location.length < 2 || location.length > 80) return { error: "Enter your city or location.", field: "location" };

  await db.user.update({ where: { id: user.id }, data: { phone, location, mustCompleteProfile: false } });
  await audit({ actorId: user.id, action: "account.profile_completed", targetType: "user", targetId: user.id, summary: "Added phone and location on first sign-in" });
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
