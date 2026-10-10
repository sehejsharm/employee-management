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

- **Sign in** with your employee ID (`FR-0042`) or work email. First sign-in
  forces a new password. Five wrong attempts lock the account for 15 minutes.
- **My work** — your next deadline counting down, everything due grouped by
  *overdue / today / tomorrow / this week*, requests for updates waiting on
  you, and pinned announcements.
- **Tasks** — every task has a deadline with **date and time**, a priority,
  one or more assignees, a brief, **links, written notes and documents**, a
  checklist, comments and **progress updates** (with a % complete). List,
  **kanban board** (drag between columns) and **calendar** views.
- **Reminders** — 24 hours before, 2 hours before, and when a task becomes
  overdue: in the inbox, as a toast, and as a desktop notification if you turn
  them on. Whoever assigned the work hears when it slips.
- **Org chart** — the whole company as a tree, with departments, who is on
  leave and who has left. Search, zoom, collapse branches.
- **People** directory and profiles, **announcements**, a **⌘K command
  palette**, light and dark themes, and a phone layout with a bottom tab bar.

**For founders and management**

- **Mission Control** — the founders' live dashboard: a radar of every
  person's deadline health, every deadline counting down to the second,
  14-day throughput, on-time rate, workload per person, live activity and
  unanswered update requests. Re-syncs every 45 seconds.
- **Assign work** to anyone (founders always; management when granted).
- **Request an update** on any task — assignees are notified, the request
  stays visible until they post a progress update, which answers it.
- **Leadership board** — what each founder and lead is working on, what
  they've delegated, and their current focus. Founders see task detail;
  management sees focus and workload.
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
| Founder | Everything. Sees every task. Always holds every permission. |
| Management | Their own and their reporting line's work. Assign tasks, edit the org chart and manage people **when a founder grants it**. |
| Employee / Intern | Their own tasks and tasks for themselves; comment, attach, post updates. |

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

Requirements: Node.js 20.19+ and PostgreSQL 14+.

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

**Vercel + managed Postgres (recommended).**

1. Create a Postgres database (Supabase, Neon or Vercel Postgres). In India,
   pick the Mumbai region (`ap-south-1`).
2. Import the repo in Vercel. Set the variables from `.env.example`:
   `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `APP_URL`,
   `APP_TIMEZONE`, `HR_WEBHOOK_SECRET`, `CRON_SECRET`.
3. Run migrations against production once: `DATABASE_URL=… npx prisma migrate deploy`
   (or add it to the build command).
4. Create the first founder: `DATABASE_URL=… npm run create-founder -- --email you@focusrealm.com --first You`.
5. `vercel.json` schedules the deadline sweep daily on the Hobby plan; on Pro,
   change it to every 15 minutes (`*/15 * * * *`). People who are signed in
   get reminders within a minute regardless.

**Self-hosted:** `docker compose up --build` runs Postgres and the app;
migrations apply on start.

**Health check:** `GET /api/health` → `{ ok: true, database: "up" }`.

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
