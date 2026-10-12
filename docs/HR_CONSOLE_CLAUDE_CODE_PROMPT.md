# Prompt for the HR console repository

Open a Claude Code session on **`sehejsharm/focusrealmhr`** and paste everything
between the lines below. It's self-contained: it tells Claude where the client
code lives, what to change, and how to backfill people who are already in the
HR console.

Before you run it, make sure the Workspace side is deployed and has
`HR_WEBHOOK_SECRET` set (see `docs/HR_CONSOLE_INTEGRATION.md` in the
employee-management repo).

---

```text
Connect this HR console to the Focus Realm Workspace (our employee management app,
repo sehejsharm/employee-management) so every person added here automatically gets
a Workspace login: an employee ID like FR-0042 plus a temporary password.

Read these two files from sehejsharm/employee-management, branch
claude/friendly-heisenberg-mgxoro (the deployed branch), before writing code:
  - docs/HR_CONSOLE_INTEGRATION.md          (the contract, security model, and where to hook in)
  - integrations/hr-console/workspace-sync.server.ts   (the ready-made client)
They're public: https://github.com/sehejsharm/employee-management

Do the following, following this repo's existing conventions (AGENTS.md, CLAUDE.md,
the style of lib/onboarding/*.server.ts, and the existing mailbox-password flow):

1. Copy integrations/hr-console/workspace-sync.server.ts verbatim to
   lib/onboarding/workspace-sync.server.ts. Do not change its request format.

2. Add to the Candidate type in lib/onboarding/types.ts:
     workspace?: { loginId: string; provisionedAt: string; sealedPassword?: string; viewedAt?: string };
   and expose a safe view of it (loginId, provisionedAt, collected: !sealedPassword) in the
   admin candidate GET route, never the sealed value.

3. New people: in app/api/onboarding/admin/candidates/route.ts POST, right after
   createCandidate(), call provisionWorkspaceAccount({ ...candidate, role: trackOf(candidate) }).
   If it returns a login, store workspace.loginId and, if present, seal(temporaryPassword)
   into workspace.sealedPassword with updateCandidate(). If the call throws, log it and still
   return 201 — creating the candidate must never fail because the Workspace is down.
   Return { workspace: { loginId } } in the response.

4. Keep it in sync in app/api/onboarding/admin/candidates/[id]/route.ts:
   - "remove"    → offboardWorkspaceAccount(id, reason)   (locks them out of the Workspace)
   - "restore"   → restoreWorkspaceAccount(id)
   - "provision" → updateWorkspaceAccount({ ...updated, role: trackOf(updated) })
                   (their Workspace email becomes the new company mailbox)
   Also call updateWorkspaceAccount after a candidate submits their details
   (app/api/onboarding/session/[token]/details/route.ts) so the Workspace gets their full name.
   Every call: await it, .catch(console.error), never block the HR action on it.

5. Existing people (already in the console before this change): add an admin-only action
   "sync-workspace" — POST /api/onboarding/admin/workspace/sync — that loops over
   listCandidates(), and for every candidate WITHOUT workspace.loginId and WITHOUT a removal,
   calls provisionWorkspaceAccount and stores the login + sealed password exactly as in step 3.
   Process them one at a time, collect per-person results, and return
   { synced, alreadyLinked, failed: [{ id, name, error }] }. It must be safe to run again:
   the client derives the event id from the candidate id, so re-running never creates
   duplicates or a second password. The Workspace refuses founder accounts (HTTP 403) —
   founders already sign in with their own Workspace login — so list those under
   "skipped" rather than "failed". Add a "Sync everyone to the Workspace" button on
   /hr/admin that calls it and shows the summary.

6. Showing the credentials once: on the founders' candidate page (/hr/admin/[id]) add a
   "Workspace login" card that shows the loginId and, while workspace.sealedPassword exists,
   a "Reveal temporary password" button. Mirror the existing mailbox password pattern:
   a POST action unseals it, deletes sealedPassword, sets viewedAt, and returns it once.
   Show the Workspace sign-in URL (FOCUS_REALM_WORKSPACE_URL + "/login") next to it.
   Also show the same one-time reveal to the candidate on their final onboarding stage
   (/hr/[token]) using the same rules. Add a founder-only "Reset Workspace password" button
   that calls resetWorkspacePassword(id) and stores the new sealed password the same way.

7. Configuration: add to .env.example (server-only, never NEXT_PUBLIC_):
     FOCUS_REALM_WORKSPACE_URL=      # the Workspace's production domain, e.g. https://employee-management.vercel.app
                                     # (never a per-deployment *.vercel.app URL — those are behind Vercel's login wall)
     FOCUS_REALM_WORKSPACE_SECRET=   # same value as HR_WEBHOOK_SECRET on the Workspace
   Document them in README.md. With them unset, every Workspace call is a silent no-op.

8. Shared emails: several people can share one email (e.g. a team mailbox). Never
   de-duplicate, match or look anyone up by email when syncing — the candidate id
   (externalId) is the only key, and the Workspace employee ID (loginId) is what people
   sign in with. Always show the loginId, never the email, as "how to sign in".

9. Security: never log or return the plaintext password except in the one-time reveal
   responses; never put it in the candidate list endpoint; keep the console's admin auth
   check on every new route.

When done: run the linter and a production build, then list exactly which files changed
and how to test it end to end (create a test candidate, confirm FR-xxxx appears, reveal
the password once, sign in to the Workspace with it).
```

---

## What happens after it's in place

**New people** — a founder creates the candidate in the HR console as usual.
In the same click the Workspace creates their login. The founder (or the
candidate, on their last onboarding step) reveals the temporary password once.
The person signs in at the Workspace with their **employee ID** (never their
email — colleagues can share one) and that password, and is asked to set their own.

**People already in the HR console** — a founder clicks **Sync everyone to the
Workspace** once. Everyone without a login gets one; each person's temporary
password waits, sealed, on their page in the HR console until it's revealed.
Running it again is harmless.

**People you already added by hand in the Workspace** — the sync links them by
**employee ID** (when the HR console sends `employeeCode`) instead of creating a
duplicate, and doesn't touch their password. It never links by email: two people
with the same email are always two separate accounts.

**Leavers** — removing someone in the HR console locks them out of the
Workspace immediately and marks them *Former* on the org chart. Restoring them
in the HR console lets them back in.

**No HR change yet?** You don't have to wait: founders can add anyone from
**Workspace → People → Add member**, which generates the ID and temporary
password on the spot.


---

## Follow-up: people who share an email weren't synced

Before this change the Workspace refused a second person with an email that was
already in use (HTTP 409 "…is already used by another account"), so the HR
console recorded them as failed. The Workspace now accepts shared emails. Once
it's deployed, open a Claude Code session on **`sehejsharm/focusrealmhr`** and
paste this:

```text
The Focus Realm Workspace (repo sehejsharm/employee-management, deployed branch
claude/friendly-heisenberg-mgxoro) now allows several employees to share one email.
Emails are no longer unique there and are never used to sign in or to match people:
the HR candidate id (externalId) links the two systems and the Workspace employee ID
(e.g. FR-0042) is the only login ID. Read docs/HR_CONSOLE_INTEGRATION.md and
integrations/hr-console/workspace-sync.server.ts from that repo first.

Update this HR console to match:

1. Replace lib/onboarding/workspace-sync.server.ts with the current
   integrations/hr-console/workspace-sync.server.ts, verbatim.

2. Remove anything in the Workspace sync path that de-duplicates, skips, matches or
   looks people up by email (e.g. "someone with this email is already synced",
   a Set of seen emails in the sync loop, findCandidateByEmail before provisioning).
   Two candidates with the same invitedEmail or mailbox address are two different
   people and each must get their own Workspace login. Key everything on candidate.id.
   If the console itself blocks creating a candidate whose email already exists, allow
   it (a warning such as "Also used by: <names>" is fine; refusing is not).

3. Make "Sync everyone to the Workspace" (POST /api/onboarding/admin/workspace/sync)
   also retry candidates whose previous attempt failed: any active candidate WITHOUT
   workspace.loginId is attempted again. Re-running stays safe — the event id comes
   from the candidate id, and the Workspace re-applies an event that previously failed.
   Return { synced, alreadyLinked, skipped, failed: [{ id, name, email, error }] } and
   show failures with their error text on /hr/admin so nothing fails silently.

4. Wherever the console shows Workspace credentials (founder candidate page, the
   candidate's final onboarding step), label the loginId as "Sign in with this
   employee ID" and say the email is not a login. Where an email is shared, list the
   other candidates using it.

5. Send employeeCode in the payload only if this console already stores one; never
   invent it.

Then run the linter and a production build, list the changed files, and describe how
to test: create two candidates with the same email, click "Sync everyone to the
Workspace", confirm each gets a different FR-xxxx, and sign in to the Workspace with
each employee ID.
```

After it's deployed, click **Sync everyone to the Workspace** once. Everyone who
was skipped because of a shared email gets their own employee ID and temporary
password. In the Workspace, *People → Who uses which email* shows who shares
each mailbox.
