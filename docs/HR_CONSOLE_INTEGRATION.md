# Connecting the HR console to the Workspace

**Goal:** the moment a founder adds someone in the Focus Realm HR console
(`focusrealmhr`), that person gets a Workspace login: an **employee ID**
(`FR-0042`) and a **temporary password**. HR shows those credentials once. The
person signs in to the Workspace with them and is asked to choose their own
password on first sign-in.

```
 HR console (focusrealmhr)                         Workspace (this app)
 ─────────────────────────                         ────────────────────
 Founder creates candidate ──► POST /api/integrations/hr/events
                               X-FR-Timestamp: 1760000000
                               X-FR-Signature: v1=<HMAC-SHA256>
                               { "type": "employee.created", … }
                                                   ✓ verify signature + timestamp
                                                   ✓ apply once per event id
                                                   ✓ create account FR-0042
                                                   ✓ bcrypt a fresh temp password
 ◄───────────────────────────  201 { user: { employeeCode: "FR-0042" },
                                    credentials: { temporaryPassword: "…" } }
 Seal the password (AES-GCM, like
 the mailbox password) and show it
 to the founder / intern ONCE.
```

Later events keep the two systems in step:

| Happens in the HR console | Event | Effect in the Workspace |
|---|---|---|
| Candidate created / existing member added | `employee.created` | Account created; temp password returned once |
| Details submitted, mailbox provisioned, role changed | `employee.updated` | Name / email / title / department updated (email becomes the company mailbox) |
| Founder removes the intern | `employee.offboarded` | Status → Former, every session signed out, login stops working. History kept. |
| Removal undone | `employee.restored` | Status → Active, can sign in again |
| "Reset workspace password" | `employee.credentials_reset` | New temp password returned once, signed out everywhere |

---

## 1. Configure both apps

Generate one shared secret:

```bash
openssl rand -hex 32
```

| App | Variable | Value |
|---|---|---|
| Workspace | `HR_WEBHOOK_SECRET` | the secret |
| HR console | `FOCUS_REALM_WORKSPACE_SECRET` | the same secret |
| HR console | `FOCUS_REALM_WORKSPACE_URL` | the Workspace's **production domain**, e.g. `https://employee-management.vercel.app` or your custom domain |

Both are server-only. Never prefix them with `NEXT_PUBLIC_`. On Vercel, add
them under **Settings → Environment Variables (Production)** and **redeploy** —
variables only reach new deployments. Never use a per-deployment URL
(`…-git-…vercel.app` or a hashed one): those sit behind Vercel's login wall and
the HR console would get a 401 HTML page back.

Check the connection from the Workspace repo once it is deployed (with the
database migrated):

```bash
APP_URL=https://<your-workspace-domain> HR_WEBHOOK_SECRET=<the secret> npm run hr:simulate -- ping
# 200 OK { "ok": true, "action": "pong" }
# 503 → the secret isn't set on that deployment (redeploy after adding it)
# 401 with an HTML body → you used a protected deployment URL, not the production domain
```

The **Workspace admin → HR console** screen shows every delivery, its result
and any error, with credentials always redacted.

## 2. Add the client to the HR console

Copy [`integrations/hr-console/workspace-sync.server.ts`](../integrations/hr-console/workspace-sync.server.ts)
to `focusrealmhr/lib/onboarding/workspace-sync.server.ts`. It has no
dependencies, signs every request, retries safely, and **does nothing** until
the two environment variables are set — so it can ship before the Workspace is
live.

### 2a. Record the login on the candidate

`lib/onboarding/types.ts` — add to `Candidate`:

```ts
/** The Focus Realm Workspace login, created when the candidate was. */
workspace?: {
  loginId: string;
  provisionedAt: string;
  /** Temporary password, sealed like the mailbox password and destroyed after one view. */
  sealedPassword?: string;
  viewedAt?: string;
};
```

### 2b. Provision on create

`app/api/onboarding/admin/candidates/route.ts`, at the end of `POST`, right
after `createCandidate(...)`:

```ts
import { provisionWorkspaceAccount } from "@/lib/onboarding/workspace-sync.server";
import { seal } from "@/lib/onboarding/security.server";

// …after const candidate = await createCandidate({ … });

let workspace: { loginId: string } | null = null;
try {
  const login = await provisionWorkspaceAccount({ ...candidate, role: trackOf(candidate) });
  if (login) {
    workspace = { loginId: login.loginId };
    await updateCandidate(candidate.id, (c) => ({
      ...c,
      workspace: {
        loginId: login.loginId,
        provisionedAt: new Date().toISOString(),
        ...(login.temporaryPassword ? { sealedPassword: seal(login.temporaryPassword) } : {}),
      },
    }));
  }
} catch (error) {
  // The candidate is created either way; the founders' console can retry.
  console.error("Workspace provisioning failed", error);
}

return json({ id: candidate.id, token: candidate.token, workspace }, 201);
```

Calling `provisionWorkspaceAccount` again for the same candidate is safe — the
event id is derived from the candidate id, so a retry returns the same login
without creating a duplicate (and without a second password).

### 2c. Keep it in sync

`app/api/onboarding/admin/candidates/[id]/route.ts` — add one line before
each `return json(...)` in these three cases:

```ts
import {
  offboardWorkspaceAccount,
  restoreWorkspaceAccount,
  updateWorkspaceAccount,
} from "@/lib/onboarding/workspace-sync.server";

case "remove": {
  // …existing code, after `const updated = await updateCandidate(…)`
  await offboardWorkspaceAccount(id, reason).catch(console.error);
  return json({ ok: true, retention: updated ? retentionOf(updated) : null });
}

case "restore": {
  // …existing code, after `await updateCandidate(…)`
  await restoreWorkspaceAccount(id).catch(console.error);
  return json({ ok: true });
}

case "provision": {
  // …existing code, after `const updated = await updateCandidate(…)`
  // Their Workspace sign-in email becomes the new company mailbox.
  if (updated) await updateWorkspaceAccount({ ...updated, role: trackOf(updated) }).catch(console.error);
  return json({ ok: true, address, password, stage: updated ? currentStage(updated) : null });
}
```

Also call `updateWorkspaceAccount` after the candidate submits their details
(`app/api/onboarding/session/[token]/details/route.ts`) so the Workspace picks
up their full legal name and phone.

### 2d. Show the credentials once

Mirror the existing mailbox flow: a founder (or the candidate, on their final
onboarding stage) clicks **Reveal Workspace login**, the route `unseal`s the
password, deletes `sealedPassword`, sets `viewedAt`, and returns:

```
Employee ID   FR-0042
Password      AbC4-dEf5-GhJ6-kLm7
Sign in at    https://workspace.focusrealm.com/login
```

## 3. The contract

`POST {WORKSPACE_URL}/api/integrations/hr/events`

**Headers**

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-FR-Timestamp` | Unix time in seconds |
| `X-FR-Signature` | `v1=` + hex HMAC-SHA256 of `"<timestamp>.<raw body>"` with the shared secret. Several comma-separated `v1=` values are accepted, which lets you rotate the secret without downtime. |

**Body**

```json
{
  "id": "evt_9a8f…",
  "type": "employee.created",
  "createdAt": "2026-10-09T10:00:00.000Z",
  "data": {
    "externalId": "c81e728d9d4c2f63",
    "fullName": "Priya Menon",
    "email": "priya.menon@focusrealm.com",
    "role": "INTERN",
    "title": "Marketing Intern",
    "department": "Marketing",
    "managerEmail": "riya.sharma@focusrealm.com",
    "phone": "+91 98…",
    "startDate": "2026-10-12",
    "employeeCode": "FR-0042",
    "credentials": { "passwordHash": "$2b$12$…", "mustChangePassword": true }
  }
}
```

| Field | Notes |
|---|---|
| `externalId` | **Required.** The HR console's record id. Links the two systems. |
| `email` | Required to create. Lower-cased. Ignored on updates for anyone whose email a founder or manager changed in the Workspace. **Not unique** — several employees can share one mailbox. Never used to sign in or to match records; the employee ID is. |
| `fullName` *or* `firstName`/`lastName` | Required to create. |
| `role` | `INTERN` (default), `EMPLOYEE` or `MANAGER`. `FOUNDER` is refused unless the Workspace sets `HR_ALLOW_FOUNDER_PROVISIONING=true`. |
| `title`, `department`, `phone`, `location`, `startDate` | Optional. Unknown departments are created. |
| `managerEmail` / `managerEmployeeCode` | Optional. Places them on the org chart. Prefer `managerEmployeeCode`: an email is only used when exactly one current person has it. |
| `employeeCode` | Optional. Omit it and the Workspace assigns the next `FR-0001`-style id. If it matches an account a founder added by hand, that account is linked to this HR record. |
| `credentials` | Optional. Omit it (recommended) and the Workspace generates a strong temporary password and returns it once. Or send `passwordHash` (bcrypt — the plaintext never leaves HR), or `password` (hashed on arrival, never stored or logged). |

**Responses**

| Status | Meaning |
|---|---|
| `201` | Account created. `credentials.temporaryPassword` present if the Workspace generated it. |
| `200` | Applied (update, offboard, restore, reset), or `duplicate: true` if that event id was already applied. |
| `400` / `422` | The event or payload is malformed — fix it, don't retry. |
| `401` | Bad or missing signature, or timestamp more than 5 minutes off. |
| `403` | Tried to create, link to or change a founder account. |
| `404` | Offboard/restore/reset for an `externalId` that was never linked. |
| `409` | The employee ID already belongs to a different HR record. |
| `503` | `HR_WEBHOOK_SECRET` isn't set on the Workspace. |

## 4. Security model — do's and don'ts

**Do**

- Keep the secret server-side in both apps, and rotate it if it ever leaks
  (send two signatures during the switch-over).
- Let the Workspace generate the temporary password, then **seal it** in the HR
  console exactly like the mailbox password: encrypted at rest, shown once,
  destroyed on view.
- Keep `mustChangePassword` on (the default). The temporary password only
  works until the person chooses their own.
- Offboard people in the HR console. That single action locks them out of the
  Workspace too, and signs out every device.

**Don't**

- Don't email or Slack temporary passwords in plain text. Show them once in the
  console, or hand them over in person.
- Don't let the two apps share a database. They talk through this one signed
  endpoint; each can be deployed, migrated and secured on its own.
- Don't call the endpoint from the browser. Only the HR console's server code
  holds the secret.
- Don't create founder accounts through the integration. Founders are created
  with `npm run create-founder` on the Workspace.

## 5. Later: single sign-on

Today each app keeps its own password store; HR issues the first credential and
the person owns it from then on. If you later want **one** password across HR,
the Workspace and other internal tools, put an identity provider in front
(Google Workspace / Microsoft Entra SSO for the `@focusrealm.com` domain, or a
hosted IdP) and switch the Workspace's login to OIDC. The provisioning events
above stay exactly the same — they'd create the account, and the IdP would
handle the password.
