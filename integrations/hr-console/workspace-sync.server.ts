import { createHmac, randomUUID } from "node:crypto";

/**
 * Focus Realm HR console → Focus Realm Workspace account sync. SERVER ONLY.
 *
 * Drop this file into the HR console at lib/onboarding/workspace-sync.server.ts.
 * It has no dependencies beyond Node and fetch, and it fails soft: if the two
 * environment variables below are not set, every call is a no-op that returns
 * null, so the HR console keeps working exactly as before.
 *
 *   FOCUS_REALM_WORKSPACE_URL     e.g. https://workspace.focusrealm.com
 *   FOCUS_REALM_WORKSPACE_SECRET  the same value as HR_WEBHOOK_SECRET in the workspace
 *
 * Every request is signed (HMAC-SHA256 over "<timestamp>.<body>") and carries
 * an event id. The workspace applies each event id once, so a retried request
 * can never create a second account.
 */

export interface WorkspaceCandidate {
  id: string;
  invitedName: string;
  invitedEmail: string;
  startDate: string;
  details?: { fullName?: string; phone?: string } | null;
  mailbox?: { address: string } | null;
  /** Role title and label, e.g. from trackOf(candidate). */
  role?: { roleTitle: string; label: string };
}

export interface WorkspaceCredentials {
  /** The employee ID they sign in with, e.g. FR-0042. Their email works too. */
  loginId: string;
  email: string;
  /** Present only when the workspace generated a password. Seal it, show it once, then discard it. */
  temporaryPassword?: string;
  loginUrl: string;
}

type EventType =
  | "employee.created"
  | "employee.updated"
  | "employee.offboarded"
  | "employee.restored"
  | "employee.credentials_reset";

function settings() {
  const url = process.env.FOCUS_REALM_WORKSPACE_URL?.replace(/\/$/, "");
  const secret = process.env.FOCUS_REALM_WORKSPACE_SECRET;
  return url && secret ? { url, secret } : null;
}

async function send(type: EventType, data: Record<string, unknown>, eventId = `evt_${randomUUID()}`) {
  const s = settings();
  if (!s) return null;

  const body = JSON.stringify({ id: eventId, type, createdAt: new Date().toISOString(), data });

  // Three attempts with backoff. The same event id is reused, so retries are safe.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", s.secret).update(`${timestamp}.${body}`).digest("hex");
    try {
      const res = await fetch(`${s.url}/api/integrations/hr/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FR-Timestamp": String(timestamp),
          "X-FR-Signature": `v1=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) return json;
      // 4xx means the request itself is wrong — retrying will not help.
      if (res.status < 500) throw new Error(`Workspace rejected ${type}: ${json.error ?? res.status}`);
      lastError = new Error(`Workspace error ${res.status}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Workspace rejected")) throw error;
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("Workspace unreachable");
}

function toEmployee(c: WorkspaceCandidate) {
  return {
    externalId: c.id,
    fullName: c.details?.fullName || c.invitedName,
    // The company mailbox once it exists, the invite address until then.
    email: c.mailbox?.address || c.invitedEmail,
    role: "INTERN",
    title: c.role?.roleTitle,
    department: c.role?.label,
    phone: c.details?.phone,
    startDate: c.startDate,
  };
}

function credentialsFrom(json: Record<string, unknown> | null): WorkspaceCredentials | null {
  if (!json) return null;
  const user = json.user as { employeeCode: string; email: string; loginUrl: string } | undefined;
  const creds = json.credentials as { loginId: string; email: string; temporaryPassword: string } | undefined;
  if (!user) return null;
  return {
    loginId: user.employeeCode,
    email: user.email,
    loginUrl: user.loginUrl,
    ...(creds ? { temporaryPassword: creds.temporaryPassword } : {}),
  };
}

/**
 * Call right after a candidate is created. Creates their workspace login and
 * returns it — including a temporary password the first time — or null when
 * the integration is not configured.
 *
 * The event id is derived from the candidate id, so calling this twice for the
 * same candidate is harmless.
 */
export async function provisionWorkspaceAccount(c: WorkspaceCandidate) {
  return credentialsFrom(await send("employee.created", toEmployee(c), `evt_hr_${c.id}_created`));
}

/** Call when their name, email (e.g. a new company mailbox), title or phone changes. */
export async function updateWorkspaceAccount(c: WorkspaceCandidate) {
  return credentialsFrom(await send("employee.updated", toEmployee(c)));
}

/** Call when a founder removes the intern. Their login stops working immediately. */
export async function offboardWorkspaceAccount(candidateId: string, reason?: string) {
  return send("employee.offboarded", { externalId: candidateId, reason });
}

/** Call when a removal is undone. */
export async function restoreWorkspaceAccount(candidateId: string) {
  return send("employee.restored", { externalId: candidateId });
}

/** Issues a fresh temporary password (returned once) and signs them out everywhere. */
export async function resetWorkspacePassword(candidateId: string) {
  return credentialsFrom(await send("employee.credentials_reset", { externalId: candidateId }));
}
