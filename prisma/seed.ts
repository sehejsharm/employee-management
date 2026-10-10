/**
 * Demo data for local development and previews. Never run against production:
 * it wipes every table first. Production starts empty — create the first
 * founder with `npm run create-founder`, then let the HR console provision
 * everyone else.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { databaseUrl, db } from "../src/lib/db";
import type { Role, TaskPriority, TaskStatus, EmploymentStatus } from "../src/generated/prisma/enums";

const DEMO_PASSWORD = "FocusRealm@2026";
const HOUR = 3600_000;
const DAY = 24 * HOUR;

/**
 * The seed wipes every table and creates founders with a published password,
 * so it only runs against a database on this machine (or the docker-compose
 * "db" service). NODE_ENV alone can't tell: it is unset when someone runs the
 * seed from a laptop with a production URL loaded.
 */
function assertSafeTarget() {
  const raw = databaseUrl(); // the connection the seed actually writes through
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    // Unparseable or empty: treated as unknown below.
  }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]", "db"].includes(host);
  const override = process.env.ALLOW_SEED === `wipe ${host}`;
  if ((!local || process.env.VERCEL || process.env.NODE_ENV === "production") && !override) {
    throw new Error(
      `Refusing to seed ${host || "an unknown database"}: the demo seed deletes every table and creates founders with a published password. ` +
        `If you really mean it, set ALLOW_SEED="wipe ${host}".`,
    );
  }
}

async function main() {
  assertSafeTarget();

  console.log("Clearing tables…");
  await db.$transaction([
    db.notification.deleteMany(),
    db.taskActivity.deleteMany(),
    db.updateRequest.deleteMany(),
    db.checklistItem.deleteMany(),
    db.attachment.deleteMany(),
    db.fileBlob.deleteMany(),
    db.taskAssignee.deleteMany(),
    db.task.deleteMany(),
    db.announcement.deleteMany(),
    db.integrationEvent.deleteMany(),
    db.auditLog.deleteMany(),
    db.session.deleteMany(),
    db.user.updateMany({ data: { managerId: null } }),
    db.user.deleteMany(),
    db.department.deleteMany(),
  ]);

  const departments = Object.fromEntries(
    await Promise.all(
      [
        { name: "Leadership", color: "blue", description: "The founding team." },
        { name: "Founder's Office", color: "sky", description: "Strategy, research and special projects." },
        { name: "Marketing", color: "violet", description: "Brand, content and campaigns." },
        { name: "Business Development", color: "amber", description: "Partnerships, sales and pipeline." },
        { name: "Operations", color: "teal", description: "Process, vendors and delivery." },
        { name: "Product & Technology", color: "indigo", description: "Design and engineering." },
      ].map(async (d) => [d.name, await db.department.create({ data: d })] as const),
    ),
  );

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = Date.now();

  type Seed = {
    key: string;
    code: string;
    first: string;
    last: string;
    title: string;
    role: Role;
    dept: string;
    manager?: string;
    hue: number;
    status?: EmploymentStatus;
    focus?: string;
    mustChange?: boolean;
    location?: string;
  };

  const people: Seed[] = [
    { key: "aarav", code: "FR-0001", first: "Aarav", last: "Mehta", title: "Co-founder & CEO", role: "FOUNDER", dept: "Leadership", hue: 212, focus: "Closing the seed extension and the Q4 plan", location: "Mumbai" },
    { key: "ishita", code: "FR-0002", first: "Ishita", last: "Kapoor", title: "Co-founder & COO", role: "FOUNDER", dept: "Leadership", hue: 330, focus: "Vendor consolidation and hiring plan", location: "Mumbai" },
    { key: "kabir", code: "FR-0003", first: "Kabir", last: "Malhotra", title: "Co-founder & CTO", role: "FOUNDER", dept: "Leadership", hue: 250, focus: "Shipping the v2 platform", location: "Bengaluru" },
    { key: "riya", code: "FR-0004", first: "Riya", last: "Sharma", title: "Head of Marketing", role: "MANAGER", dept: "Marketing", manager: "aarav", hue: 280, focus: "Diwali campaign", location: "Mumbai" },
    { key: "dev", code: "FR-0005", first: "Dev", last: "Patel", title: "Operations Lead", role: "MANAGER", dept: "Operations", manager: "ishita", hue: 170, location: "Pune" },
    { key: "ananya", code: "FR-0006", first: "Ananya", last: "Iyer", title: "Business Development Lead", role: "MANAGER", dept: "Business Development", manager: "aarav", hue: 35, location: "Delhi" },
    { key: "arjun", code: "FR-0007", first: "Arjun", last: "Rao", title: "Marketing Associate", role: "EMPLOYEE", dept: "Marketing", manager: "riya", hue: 200 },
    { key: "meera", code: "FR-0008", first: "Meera", last: "Nair", title: "Product Designer", role: "EMPLOYEE", dept: "Product & Technology", manager: "kabir", hue: 320 },
    { key: "vikram", code: "FR-0009", first: "Vikram", last: "Singh", title: "Full-stack Engineer", role: "EMPLOYEE", dept: "Product & Technology", manager: "kabir", hue: 228 },
    { key: "sana", code: "FR-0010", first: "Sana", last: "Qureshi", title: "Operations Associate", role: "EMPLOYEE", dept: "Operations", manager: "dev", hue: 150 },
    { key: "rohan", code: "FR-0011", first: "Rohan", last: "Gupta", title: "Marketing Intern", role: "INTERN", dept: "Marketing", manager: "riya", hue: 15 },
    { key: "tara", code: "FR-0012", first: "Tara", last: "Bose", title: "Founder's Office Intern", role: "INTERN", dept: "Founder's Office", manager: "aarav", hue: 190, focus: "Competitor teardown for the board deck" },
    { key: "neel", code: "FR-0013", first: "Neel", last: "Joshi", title: "Business Development Intern", role: "INTERN", dept: "Business Development", manager: "ananya", hue: 45, mustChange: true },
    { key: "zoya", code: "FR-0014", first: "Zoya", last: "Khan", title: "Operations Intern", role: "INTERN", dept: "Operations", manager: "dev", hue: 300, status: "ON_LEAVE" },
    { key: "kunal", code: "FR-0015", first: "Kunal", last: "Verma", title: "Marketing Intern", role: "INTERN", dept: "Marketing", manager: "riya", hue: 220, status: "INACTIVE" },
  ];

  const users: Record<string, { id: string; firstName: string }> = {};
  for (const [i, p] of people.entries()) {
    const leader = p.role === "FOUNDER" || p.role === "MANAGER";
    users[p.key] = await db.user.create({
      data: {
        employeeCode: p.code,
        email: `${p.first}.${p.last}@focusrealm.com`.toLowerCase(),
        firstName: p.first,
        lastName: p.last,
        title: p.title,
        role: p.role,
        status: p.status ?? "ACTIVE",
        canAssignTasks: leader,
        canManageOrg: p.role === "FOUNDER",
        canManagePeople: p.role === "FOUNDER",
        avatarHue: p.hue,
        focus: p.focus ?? null,
        focusUpdatedAt: p.focus ? new Date(now - (i + 1) * 3 * HOUR) : null,
        location: p.location ?? null,
        departmentId: departments[p.dept].id,
        passwordHash: hash,
        mustChangePassword: p.mustChange ?? false,
        joinedAt: new Date(now - (400 - i * 25) * DAY),
        source: p.role === "INTERN" ? "HR_CONSOLE" : "SEED",
        externalId: p.role === "INTERN" ? `hr_${p.key}` : null,
        orgOrder: i,
      },
      select: { id: true, firstName: true },
    });
  }
  for (const p of people) {
    if (p.manager) await db.user.update({ where: { id: users[p.key].id }, data: { managerId: users[p.manager].id } });
  }

  type TaskSeed = {
    title: string;
    by: string;
    to: string[];
    due: number; // hours from now
    status?: TaskStatus;
    priority?: TaskPriority;
    progress?: number;
    description?: string;
    links?: [string, string][];
    notes?: [string, string][];
    checklist?: [string, boolean][];
    updates?: [string, string, number?][]; // [who, text, progress]
    comments?: [string, string][];
    requestUpdate?: [string, string];
  };

  const tasks: TaskSeed[] = [
    {
      title: "Investor update deck for October",
      by: "aarav", to: ["tara"], due: 3.3, status: "IN_PROGRESS", priority: "URGENT", progress: 70,
      description: "Monthly investor update. Cover revenue, burn, hiring and the three asks. Use last month's deck as the base — keep it to 12 slides.",
      links: [["Last month's deck", "https://docs.google.com/presentation/d/example"], ["Metrics dashboard", "https://lookerstudio.google.com/example"]],
      checklist: [["Revenue & burn slides", true], ["Hiring update", true], ["Asks slide", false], ["Founder review", false]],
      updates: [["tara", "First 8 slides done, pulling the burn numbers from finance now.", 55], ["tara", "Burn + hiring done. Writing the asks.", 70]],
      comments: [["aarav", "Lead with the partnership win — it's the headline this month."]],
    },
    {
      title: "Shortlist 10 event venues for the Diwali offsite",
      by: "ishita", to: ["sana", "dev"], due: 1.2, status: "IN_PROGRESS", priority: "HIGH", progress: 40,
      description: "Capacity 60, within 2 hours of Mumbai, available 1–3 Nov. Include per-head cost, rooms and a contact for each.",
      notes: [["Must-haves", "• Projector + sound for town hall\n• Veg & Jain menu\n• Rooms for 30 on twin sharing\n• Outdoor space for evening event"]],
      requestUpdate: ["ishita", "Where are we on this? Need 3 options to call by tomorrow morning."],
    },
    {
      title: "Competitor teardown: pricing & positioning",
      by: "aarav", to: ["tara"], due: -6, status: "IN_REVIEW", priority: "HIGH", progress: 90,
      description: "Five closest competitors. Pricing tiers, positioning lines, channel mix, and one thing each does better than us.",
      links: [["Research doc", "https://docs.google.com/document/d/example"]],
      updates: [["tara", "Draft is in the doc — moved to review.", 90]],
    },
    {
      title: "Diwali campaign — social calendar",
      by: "riya", to: ["arjun", "rohan"], due: 20, status: "IN_PROGRESS", priority: "HIGH", progress: 35,
      description: "Three weeks of posts across Instagram and LinkedIn. Draft copy + creative brief per post.",
      checklist: [["Week 1 posts", true], ["Week 2 posts", false], ["Week 3 posts", false], ["Creative briefs", false]],
      comments: [["riya", "Keep the tone warm, not salesy. Reference last year's best performers."], ["arjun", "Week 1 is up in the sheet for review."]],
    },
    {
      title: "Write 3 blog drafts on the new product line",
      by: "riya", to: ["rohan"], due: 72, status: "TODO", priority: "MEDIUM",
      description: "1,000–1,200 words each. Outline first, then draft. SEO keywords are in the brief.",
      links: [["SEO brief", "https://docs.google.com/document/d/example-seo"]],
    },
    {
      title: "Build the partner list for Bengaluru",
      by: "ananya", to: ["neel"], due: 30, status: "TODO", priority: "HIGH",
      description: "40 potential partners with contact person, email, and why they fit. Use the template sheet.",
      links: [["Template sheet", "https://docs.google.com/spreadsheets/d/example"]],
      notes: [["Fit criteria", "Mid-size (50–500 staff), hospitality or retail, at least one location in Bengaluru."]],
    },
    {
      title: "Close the Kaveri Hotels pilot agreement",
      by: "aarav", to: ["ananya"], due: 52, status: "IN_PROGRESS", priority: "URGENT", progress: 60,
      description: "Legal has signed off on v3. Get countersignature and kick-off date.",
      updates: [["ananya", "Their GM is reviewing; expecting signature Monday.", 60]],
    },
    {
      title: "Hiring plan for Q1",
      by: "ishita", to: ["ishita"], due: 96, status: "IN_PROGRESS", priority: "HIGH", progress: 30,
      description: "Roles, timing, budget and interview loops for every team. Review with Aarav and Kabir.",
    },
    {
      title: "Seed extension — data room clean-up",
      by: "aarav", to: ["aarav"], due: 28, status: "IN_PROGRESS", priority: "URGENT", progress: 50,
      description: "Refresh financials, cap table, and customer contracts folder.",
      checklist: [["Financials", true], ["Cap table", false], ["Contracts", false]],
    },
    {
      title: "v2 platform — release candidate",
      by: "kabir", to: ["kabir", "vikram"], due: 120, status: "IN_PROGRESS", priority: "HIGH", progress: 65,
      description: "Feature freeze done. Regression pass, performance budget check, then RC tag.",
    },
    {
      title: "Design the onboarding screens",
      by: "kabir", to: ["meera"], due: 44, status: "IN_REVIEW", priority: "MEDIUM", progress: 85,
      links: [["Figma file", "https://www.figma.com/file/example"]],
      updates: [["meera", "All six screens are in Figma, ready for review.", 85]],
    },
    {
      title: "Fix the invoice PDF rounding bug",
      by: "kabir", to: ["vikram"], due: -26, status: "BLOCKED", priority: "HIGH", progress: 20,
      description: "Totals are off by ₹1 on some GST invoices. Blocked on the tax rules confirmation from finance.",
      comments: [["vikram", "Blocked: need finance to confirm whether we round per line or on the total."]],
      requestUpdate: ["kabir", "Any word from finance? Let's escalate if not by today."],
    },
    {
      title: "Vendor contract renewals — shortlist",
      by: "ishita", to: ["dev"], due: 140, status: "TODO", priority: "MEDIUM",
      description: "All contracts expiring before March. Recommend renew / renegotiate / replace for each.",
    },
    {
      title: "Monthly ops report",
      by: "dev", to: ["sana"], due: 9, status: "IN_PROGRESS", priority: "MEDIUM", progress: 45,
      description: "Same format as September. Add the new vendor SLA section.",
    },
    {
      title: "Press kit refresh",
      by: "riya", to: ["arjun"], due: -50, status: "DONE", priority: "LOW", progress: 100,
      updates: [["arjun", "New press kit is live on the site.", 100]],
    },
    {
      title: "Q3 board memo",
      by: "aarav", to: ["ishita", "kabir"], due: -80, status: "DONE", priority: "HIGH", progress: 100,
    },
    {
      title: "Customer interview synthesis",
      by: "aarav", to: ["tara", "meera"], due: 160, status: "TODO", priority: "MEDIUM",
      description: "Synthesize the 12 interviews into themes, quotes and opportunities.",
    },
    {
      title: "Set up the new team laptops",
      by: "dev", to: ["sana"], due: -30, status: "DONE", priority: "LOW", progress: 100,
    },
    {
      title: "LinkedIn thought-leadership series",
      by: "aarav", to: ["riya"], due: 200, status: "TODO", priority: "LOW",
      description: "A 6-post series from the founders on how we build. Ghost-write drafts for review.",
    },
    {
      title: "Security review of the HR integration",
      by: "kabir", to: ["vikram"], due: 64, status: "TODO", priority: "HIGH",
      description: "Verify webhook signing, secret rotation and that no credentials end up in logs.",
    },
  ];

  let n = 0;
  for (const t of tasks) {
    n += 1;
    const createdAt = new Date(now - (6 + n) * DAY);
    const dueAt = new Date(now + t.due * HOUR);
    const status = t.status ?? "TODO";
    const task = await db.task.create({
      data: {
        title: t.title,
        description: t.description ?? null,
        status,
        priority: t.priority ?? "MEDIUM",
        dueAt,
        progress: t.progress ?? (status === "DONE" ? 100 : 0),
        completedAt: status === "DONE" ? new Date(dueAt.getTime() - 4 * HOUR) : null,
        createdById: users[t.by].id,
        createdAt,
        assignees: { create: t.to.map((k) => ({ userId: users[k].id, assignedAt: createdAt })) },
        checklist: t.checklist ? { create: t.checklist.map(([text, done], i) => ({ text, done, position: i })) } : undefined,
        attachments: {
          create: [
            ...(t.links ?? []).map(([title, url]) => ({ kind: "LINK" as const, title, url, createdById: users[t.by].id })),
            ...(t.notes ?? []).map(([title, content]) => ({ kind: "NOTE" as const, title, content, createdById: users[t.by].id })),
          ],
        },
        activities: {
          create: [
            { actorId: users[t.by].id, kind: "CREATED", createdAt },
            ...(t.comments ?? []).map(([who, body], i) => ({
              actorId: users[who].id,
              kind: "COMMENT" as const,
              body,
              createdAt: new Date(createdAt.getTime() + (i + 1) * 7 * HOUR),
            })),
            ...(t.updates ?? []).map(([who, body, progress], i) => ({
              actorId: users[who].id,
              kind: "PROGRESS_UPDATE" as const,
              body,
              meta: { progress: progress ?? 0 },
              createdAt: new Date(createdAt.getTime() + (i + 2) * 11 * HOUR),
            })),
            ...(status !== "TODO"
              ? [{ actorId: users[t.to[0]].id, kind: "STATUS_CHANGED" as const, meta: { from: "TODO", to: status }, createdAt: new Date(createdAt.getTime() + 3 * HOUR) }]
              : []),
          ],
        },
      },
    });

    if (t.requestUpdate) {
      const [who, message] = t.requestUpdate;
      await db.updateRequest.create({ data: { taskId: task.id, requestedById: users[who].id, message, createdAt: new Date(now - 2 * HOUR) } });
      await db.taskActivity.create({
        data: { taskId: task.id, actorId: users[who].id, kind: "UPDATE_REQUESTED", body: message, createdAt: new Date(now - 2 * HOUR) },
      });
      for (const k of t.to) {
        await db.notification.create({
          data: {
            userId: users[k].id,
            actorId: users[who].id,
            taskId: task.id,
            kind: "UPDATE_REQUESTED",
            title: `${users[who].firstName} asked for an update on T-${task.number}`,
            body: message,
            href: `/tasks/${task.id}`,
            createdAt: new Date(now - 2 * HOUR),
          },
        });
      }
    }

    for (const k of t.to) {
      if (k === t.by) continue;
      await db.notification.create({
        data: {
          userId: users[k].id,
          actorId: users[t.by].id,
          taskId: task.id,
          kind: "TASK_ASSIGNED",
          title: `${users[t.by].firstName} assigned you T-${task.number}`,
          body: t.title,
          href: `/tasks/${task.id}`,
          createdAt,
          readAt: status === "DONE" ? new Date() : null,
        },
      });
    }
  }

  await db.announcement.createMany({
    data: [
      {
        title: "Diwali offsite: 1–3 November",
        body: "Mark your calendars — the whole team heads out for three days of planning, workshops and celebration. Venue and travel details will follow this week. Families are welcome for the closing dinner.",
        pinned: true,
        authorId: users.ishita.id,
        createdAt: new Date(now - 1 * DAY),
      },
      {
        title: "Welcome to the Focus Realm Workspace",
        body: "From today, every assignment, deadline and update lives here. Your login comes straight from the HR console. If something looks off, tell a founder — we're iterating fast.",
        pinned: false,
        authorId: users.aarav.id,
        createdAt: new Date(now - 3 * DAY),
      },
      {
        title: "Kaveri Hotels pilot is (almost) signed",
        body: "Huge work by Ananya and the BD team. Kick-off planned for next month — Ops, please hold capacity.",
        pinned: false,
        authorId: users.aarav.id,
        createdAt: new Date(now - 5 * DAY),
      },
    ],
  });

  console.log(`Seeded ${people.length} people, ${tasks.length} tasks.`);
  console.log(`\nSign in with any employee ID (e.g. FR-0001 founder, FR-0004 manager, FR-0011 intern)`);
  console.log(`Password for every demo account: ${DEMO_PASSWORD}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
