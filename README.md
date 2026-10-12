# Focus Realm Workspace

Focus Realm's internal workspace: assignments with real deadlines, progress
updates without the chasing, a live view of who is carrying what, and one
editable picture of the organisation. Logins come straight from the Focus
Realm HR console.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4,
Prisma 7 and PostgreSQL, in the blue-and-white Focus Realm brand
([docs/BRAND.md](docs/BRAND.md)).

---

## What it does

**For everyone**

- **Sign in** with your employee ID (`FR-0042`) and password — never an email,
  because several people can share one mailbox. First sign-in forces a new
  password. Five wrong attempts lock the account for 15 minutes.
- **My work** — your next deadline counting down, everything due grouped by
  *overdue / today / tomorrow / this week*, requests for updates waiting on
  you, and pinned announcements.
- **Tasks** — every task has a deadline with **date and time**, a priority,
  **one lead and any number of followers**, a brief, **links, written notes
  and documents**, a checklist, comments and **progress updates** (with a %
  complete). List, **kanban board** (drag between columns) and **calendar**
  views.
- **Submit work with proof** — a task is never just ticked off. Handing it in
  needs at least one of: a write-up (40+ characters), a document (Word, PDF,
  slides, a spreadsheet, a screenshot) or a link. The person who assigned it
  (or a founder) accepts it — the task is done — or sends it back with notes.
- **Reminders** — 1 day, 12 hours, 6 hours, 1 hour, 30 minutes, 15 minutes and
  5 minutes before the deadline, then when it's overdue, for as long as the
  work hasn't been submitted: in the inbox, as a toast, and as a desktop
  notification if you turn them on. Whoever assigned the work hears when it
  slips.
- **Clearance** — you see your own tasks and the tasks you're on. Seeing
  anyone else's work needs clearance: ask for it under *Clearance*, and it's
  given only when **both** that colleague **and** a founder agree. Otherwise
  the answer is *No clearance given*. Clearance lets you look, not edit.
- **Org chart** — the whole company as a tree, with departments, who is on
  leave and who has left. Search, zoom, collapse branches.
- **Your day at a glance** — the first time you open the workspace each day
  (in your time zone) a short summary pops up: what's overdue, due today,
  tomorrow, the day after and later this week, plus work waiting for your
  review. It's filed in your inbox too, and *Today's plan* in the account menu
  brings it back.
- **Shared emails** — several people can share one mailbox. Everyone can see
  who uses which email under *People → Who uses which email*, and anyone
  sharing a mailbox sees exactly who they share it with on Home, Settings and
  their profile.
- **People** directory and profiles, **announcements**, a **⌘K command
  palette**, light and dark themes, and a phone layout with a bottom tab bar.

**For founders and management**

- **Mission Control** — the founders' live dashboard: a radar of every
  person's deadline health, every deadline counting down to the second,
  14-day throughput, on-time rate, workload per person, live activity and
  unanswered update requests. Re-syncs every minute.
- **Assign work** to anyone (founders always; management when granted), with
  one person leading and the rest following.
- **Reassign or add people** to a task straight from the task page
  (*Reassign / add people*): add followers, take people off, or hand the lead
  to someone else. Everyone affected is notified.
- **Review submitted work** — accept it or request changes.
- **Request an update** on tasks you assigned (founders: any task) — assignees
  are notified, the request stays visible until they post a progress update,
  which answers it.
- **Clearance (founders)** — approve or decline requests, give someone
  clearance over several colleagues at once (with an optional end date), and
  revoke it at any time. **Founders' work is visible only to founders** — no
  one else can be cleared to see it.
- **Leadership board (founders)** — what each founder and lead is working on,
  what they've delegated, and their current focus.
- **Edit the hierarchy** — drag people onto their new manager, change titles,
  departments and status (working / on leave / former). Loops are impossible.
- **People admin** — add members (ID and temporary password generated and
  shown once), change roles and permissions, reset passwords, sign someone out
  everywhere. Every change lands in an **audit log**.
- **HR console integration** — status and a delivery log under
  *Workspace admin*.

**What it deliberately doesn't do:** no time tracking, activity monitoring,
screenshots or "last seen". The audit log records administrative changes
(who changed a role or reset a password), never how people spend their time.

### Roles

| Role | Can |
|---|---|
| Founder | Everything. Sees every task, including other founders'. Always holds every permission. Gives and revokes clearance. |
| Management | Tasks they're on or assigned, plus anyone a founder has cleared them to see. Assign tasks, edit the org chart and manage people **when a founder grants it**. |
| Employee / Intern | Tasks they're on, plus anyone they've been cleared to see; comment, attach, post updates, submit work. |

Nobody but a founder can see a task that has a founder on it.

## Logins from the HR console

When someone is added in the Focus Realm HR console, the console calls this
app's signed endpoint and gets back their **employee ID** and a one-time
**temporary password**, which HR reveals once. Removing someone in the HR
console locks them out here and marks them *Former*.

- How it works, the contract and security model:
  [docs/HR_CONSOLE_INTEGRATION.md](docs/HR_CONSOLE_INTEGRATION.md)
- The ready-made client for the HR console:
  [integrations/hr-console/workspace-sync.server.ts](integrations/hr-console/workspace-sync.server.ts)
- A copy-paste Claude Code prompt to wire it into the `focusrealmhr` repo,
  including a one-click backfill for people already in the console:
  [docs/HR_CONSOLE_CLAUDE_CODE_PROMPT.md](docs/HR_CONSOLE_CLAUDE_CODE_PROMPT.md)

Test it locally: `npm run hr:simulate -- create "Priya Menon" priya@focusrealm.com`.

## Run it locally

Requirements: Node.js 22 and PostgreSQL 14+.

```bash
cp .env.example .env            # set DATABASE_URL at minimum
npm install                     # also generates the Prisma client
npm run db:migrate              # create the tables
npm run db:seed                 # optional: demo company (wipes the database!)
npm run dev                     # http://localhost:3000
```

Demo accounts after seeding — password `FocusRealm@2026` for all:

| ID | Who |
|---|---|
| `FR-0001` | Aarav Mehta — founder (Mission Control) |
| `FR-0004` | Riya Sharma — Head of Marketing (management) |
| `FR-0012` | Tara Bose — intern |
| `FR-0013` | Neel Joshi — intern on first sign-in (shows the set-password flow) |

### Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Develop, build, serve |
| `npm run lint` · `typecheck` · `test` | ESLint, TypeScript, Vitest unit tests |
| `npm run db:migrate` · `db:deploy` · `db:seed` · `db:studio` | Prisma |
| `npm run create-founder -- --email … --first … --last …` | First founder on a fresh database; prints a temporary password |
| `npm run hr:simulate -- ping \| create \| offboard \| restore \| reset` | Send signed HR console events |

## Deploy

### Vercel (recommended)

1. **Import the repo** in Vercel. `vercel.json` already sets the build command,
   the function region (Singapore, `sin1`) and the daily deadline sweep. The first
   build succeeds even with no database — the app just says it isn't set up yet.
2. **Add a database:** project → **Storage** → **Create Database** → **Neon**
   (or Supabase), region **Singapore (ap-southeast-1)**, connected to
   **Production**, with the env-var prefix left empty. Its variables are read
   automatically. Singapore is the closest region to India that both offer on
   Vercel. (A database elsewhere? Change `regions` in `vercel.json` to the
   Vercel region nearest to it — every page makes several round trips.)
3. **Settings → Environment Variables** (Production):
   - `SETUP_TOKEN` — `openssl rand -hex 24`; lets you create the first founder.
   - `CRON_SECRET` — `openssl rand -hex 32`; protects the daily reminder sweep.
   - `HR_WEBHOOK_SECRET` — `openssl rand -hex 32`, the same value as
     `FOCUS_REALM_WORKSPACE_SECRET` in the HR console (empty keeps HR sync off).
   - Optional: `APP_TIMEZONE` (IANA, e.g. `Asia/Kolkata`), `APP_URL` (only for
     a custom domain), `MAX_UPLOAD_MB` (≤ 4), `EMPLOYEE_CODE_PREFIX`.
4. **Deployments → ⋯ → Redeploy.** Production builds apply database migrations
   once the app has built; a failed migration stops the deploy and the
   previous one keeps serving. Preview builds skip migrations.
5. **Check:** `https://<your-app>/api/health` →
   `{ "ok": true, "database": "up", "schema": "ready", "setup": "needs-founder" }`.
   Other answers say what's wrong: `"not-configured"` (no database variables —
   redeploy after adding them), `"down"` (unreachable — see Vercel → Logs),
   `"not-migrated"` (redeploy).
6. **Create the first founder:** open `https://<your-app>/setup`, enter the
   setup token, your details and a password. You're signed straight in, and
   `/setup` switches itself off for good. Remove `SETUP_TOKEN` afterwards.
   Everyone else comes from the HR console (see above) or **People → Add**.

Supabase notes: free projects pause after a week without use (the app shows
"can't reach its database" — restore it in Supabase). Connections are
encrypted; to also verify Supabase's certificate set `DATABASE_CA_CERT`. A
migration closes Supabase's public Data API for these tables — the app never
uses it. If a production deploy stops at migrations with a connection error,
set `DIRECT_URL` to the **Session pooler** string (port 5432).

**Reminders.** People with the Workspace open get each deadline reminder
within a minute. For people who don't have it open, the server has to sweep
often enough to catch the 5-, 15- and 30-minute reminders. `vercel.json` sweeps
once a day (02:30 UTC — the Hobby plan's limit). On Pro, change it to
`*/5 * * * *`. On Hobby, add a free external scheduler (for example
cron-job.org) that calls the sweep every 5 minutes:
`curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/deadlines`.

**Custom domain:** Settings → Domains, then set `APP_URL` here and
`FOCUS_REALM_WORKSPACE_URL` in the HR console, and redeploy both. The HR
console must always use the production domain — per-deployment URLs sit
behind Vercel's login wall.

**Files** are stored in the database (4 MB each at most on Vercel). A free
Neon or Supabase plan holds about 0.5 GB, so share large files as links.

**Without the setup page:** from a clone, `DIRECT_URL= DATABASE_URL='<production
pooled URL>' npm run create-founder -- --email you@focusrealm.com --first You`
prints a one-time temporary password.

### Self-hosted

`docker compose up --build` runs Postgres and the app; migrations apply on
start. Create the first founder with `SETUP_TOKEN` and `/setup`, or
`npm run create-founder`.

**Never run `npm run db:seed` against a real database** — it wipes every table
and creates demo founders with a published password. It refuses any database
that isn't on your machine.

## Security notes

- Passwords: bcrypt (cost 12); sessions are random 256-bit tokens stored only
  as SHA-256 hashes, in an `httpOnly`, `SameSite=Lax`, `__Host-` cookie.
- Every page and server action re-checks the session and permissions in the
  data layer; hiding a button is never the protection.
- HR webhook: HMAC-SHA256 signatures, 5-minute replay window, idempotent event
  ids, credentials never logged, founder accounts can't be created through it.
- Uploads are stored in Postgres, served only to people who can see the task,
  with `nosniff`, a sandboxing CSP, and executable/markup types refused.
- Security headers (no framing, no indexing, HSTS, strict referrer) on every
  response.

## Project layout

```
src/
  app/(auth)/            sign-in, first-sign-in password
  app/(app)/             dashboard, tasks, org, people, leadership, announcements,
                         notifications, settings, admin
  app/api/               HR webhook, cron, health, notifications feed, search, file download
  actions/               server actions (tasks, people, org, profile, announcements)
  components/            ui primitives, app shell, tasks, org chart, mission control
  lib/                   auth, permissions, time zones, notifications, HR provisioning
prisma/                  schema, migrations, demo seed
integrations/hr-console/ drop-in client for the HR console
docs/                    brand rules, HR integration, Claude Code prompt
tests/                   unit tests (signatures, permissions, org cycles, reminders, time)
```
