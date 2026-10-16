import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, Building2, CheckCircle2, CircleAlert, HardDrive, History, PlugZap, ScrollText, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { CopyField, DeleteDepartment, DepartmentDialog, MoveFilesButton } from "@/components/app/admin-client";
import { cloudStorageConfigured } from "@/lib/storage";
import { filesStillInDatabase } from "@/lib/storage-move";
import { formatBytes } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/widgets";
import { Avatar } from "@/components/ui/avatar";
import { Badge, deptColor } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { canAdminister } from "@/lib/permissions";
import { formatDateTime, timeAgo } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Workspace admin" };

const TABS = [
  { key: "integration", label: "HR console", icon: PlugZap },
  { key: "departments", label: "Departments", icon: Building2 },
  { key: "audit", label: "Audit log", icon: ScrollText },
  { key: "storage", label: "File storage", icon: HardDrive },
] as const;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  if (!canAdminister(user)) notFound();
  const tz = await getTimeZone();
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some((t) => t.key === rawTab) ? rawTab! : "integration";

  const [active, onLeave, former, synced, departmentsCount] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE" } }),
    db.user.count({ where: { status: "ON_LEAVE" } }),
    db.user.count({ where: { status: "INACTIVE" } }),
    db.user.count({ where: { source: "HR_CONSOLE" } }),
    db.department.count(),
  ]);

  return (
    <>
      <PageHeader eyebrow="Leadership" title="Workspace admin" description="Connections, structure and the record of administrative changes." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard index={0} label="Active members" value={active} icon={<Users />} />
        <StatCard index={1} label="On leave" value={onLeave} icon={<Activity />} tone="warning" />
        <StatCard index={2} label="Synced from HR" value={synced} icon={<PlugZap />} tone="success" hint={`${former} former members`} />
        <StatCard index={3} label="Departments" value={departmentsCount} icon={<Building2 />} />
      </div>

      <div className="no-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin?tab=${t.key}`}
            className={cn(
              "relative flex shrink-0 items-center gap-2 px-3 pb-3 pt-1 text-[13.5px] font-medium transition-colors",
              tab === t.key ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            {tab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </Link>
        ))}
      </div>

      {tab === "integration" && <Integration tz={tz} />}
      {tab === "departments" && <Departments />}
      {tab === "audit" && <Audit tz={tz} />}
      {tab === "storage" && <Storage />}
    </>
  );
}

async function Integration({ tz }: { tz: string }) {
  const configured = !!config.hrWebhookSecret();
  const events = await db.integrationEvent.findMany({ orderBy: { createdAt: "desc" }, take: 25 });
  const last = events[0];
  const failures = events.filter((e) => e.status === "failed").length;
  const endpoint = `${config.appUrl()}/api/integrations/hr/events`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader icon={<History />} title="Recent deliveries" description="Every event the HR console has sent. Credentials are never recorded." />
        <CardBody className="px-0 pb-2">
          {events.length === 0 ? (
            <EmptyState icon={<PlugZap />} title="No events yet" description="Once the HR console is connected, every new hire, update and departure appears here." compact />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead>
                  <tr className="border-y border-line bg-surface-sunken/60 text-[11px] uppercase tracking-wider text-fg-subtle">
                    <th className="px-5 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Event</th>
                    <th className="px-3 py-2 font-semibold">Subject</th>
                    <th className="px-5 py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const s = (e.summary ?? {}) as Record<string, string>;
                    return (
                      <tr key={e.id} className="border-b border-line last:border-0">
                        <td className="whitespace-nowrap px-5 py-3 text-fg-muted" title={formatDateTime(e.createdAt, tz)} suppressHydrationWarning>
                          {timeAgo(e.createdAt)}
                        </td>
                        <td className="px-3 py-3 font-mono text-[12px]">{e.type}</td>
                        <td className="max-w-[220px] truncate px-3 py-3">{s.email ?? s.fullName ?? s.externalId ?? "—"}</td>
                        <td className="px-5 py-3">
                          {e.status === "processed" ? (
                            <Badge tone="success" dot>
                              Applied
                            </Badge>
                          ) : e.status === "failed" ? (
                            <span title={e.error ?? undefined}>
                              <Badge tone="danger" dot>
                                Failed
                              </Badge>
                              {e.error && <span className="mt-1 block max-w-[260px] truncate text-xs text-danger">{e.error}</span>}
                            </span>
                          ) : (
                            <Badge tone="neutral" dot>
                              {e.status}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader
            icon={configured ? <CheckCircle2 /> : <CircleAlert />}
            title="Connection"
            description={configured ? "The signing secret is set. The HR console can provision accounts." : "Set HR_WEBHOOK_SECRET to switch the integration on."}
          />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", configured ? (failures ? "bg-warning" : "bg-success") : "bg-danger")} />
              <span className="text-[13.5px] font-medium">
                {configured ? (failures ? `Connected · ${failures} recent failure${failures === 1 ? "" : "s"}` : "Connected") : "Not configured"}
              </span>
              {last && (
                <span className="ml-auto text-xs text-fg-subtle" suppressHydrationWarning>
                  last event {timeAgo(last.createdAt)}
                </span>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-fg-muted">Endpoint for the HR console</div>
              <CopyField value={endpoint} />
            </div>
            <ol className="space-y-2.5 text-[13px] text-fg-muted">
              {[
                "Generate a secret: openssl rand -hex 32",
                "Set it as HR_WEBHOOK_SECRET here and as FOCUS_REALM_WORKSPACE_SECRET in the HR console.",
                "Set FOCUS_REALM_WORKSPACE_URL in the HR console to this workspace's address.",
                "Drop integrations/hr-console/workspace-sync.server.ts into the HR console and call it after a candidate is created.",
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-soft-fg">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="rounded-xl bg-surface-sunken p-3 text-xs leading-relaxed text-fg-subtle">
              Full contract, security model and copy-paste code: <span className="font-mono text-fg-muted">docs/HR_CONSOLE_INTEGRATION.md</span>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

async function Departments() {
  const departments = await db.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true, description: true, _count: { select: { members: { where: { status: { not: "INACTIVE" } } } } } },
  });
  return (
    <Card>
      <CardHeader icon={<Building2 />} title="Departments" description="Used for colour-coding the org chart, the directory and assignment lists." action={<DepartmentDialog />} />
      <CardBody>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn("h-3 w-3 rounded-full", deptColor(d.color).dot)} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">{d.name}</div>
                {d.description && <div className="truncate text-xs text-fg-subtle">{d.description}</div>}
              </div>
              <span className="text-xs text-fg-subtle tabular">{d._count.members} people</span>
              <DepartmentDialog department={d} />
              <DeleteDepartment id={d.id} name={d.name} members={d._count.members} />
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

async function Audit({ tz }: { tz: string }) {
  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { actor: { select: { firstName: true, lastName: true, avatarHue: true } } },
  });
  return (
    <Card>
      <CardHeader icon={<ScrollText />} title="Audit log" description="Administrative changes to accounts and the organisation. No activity tracking — only who changed what." />
      <CardBody>
        {entries.length === 0 ? (
          <EmptyState icon={<ScrollText />} title="Nothing recorded yet" compact />
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-3">
                {e.actor ? (
                  <Avatar person={e.actor} size="sm" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
                    <PlugZap className="size-3.5" />
                  </span>
                )}
                <div className="min-w-0 flex-1 text-[13px]">
                  <p>
                    <span className="font-medium">{e.actor ? `${e.actor.firstName} ${e.actor.lastName}` : "HR console"}</span>{" "}
                    <span className="text-fg-muted">— {e.summary}</span>
                  </p>
                  <p className="text-xs text-fg-subtle" suppressHydrationWarning>
                    {formatDateTime(e.createdAt, tz)} · <span className="font-mono">{e.action}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

async function Storage() {
  const cloud = cloudStorageConfigured();
  const [left, inCloud] = await Promise.all([filesStillInDatabase(), db.fileBlob.count({ where: { storageKey: { not: null } } })]);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          icon={<HardDrive />}
          title="Where files are kept"
          description="Proof of work, task files and announcement PDFs."
        />
        <CardBody className="space-y-4 text-[13.5px]">
          {cloud ? (
            <p className="flex items-start gap-2 rounded-xl border border-success/25 bg-success-soft px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              <span>
                <span className="font-semibold">Cloudflare R2 is connected.</span> New uploads go there — 10 GB free, and downloads cost nothing.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2.5">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                <span className="font-semibold">Files are being kept in the Supabase database.</span> Cloudflare R2 isn&apos;t connected on this deployment yet — add the four
                R2 settings in Vercel and redeploy (see docs/CLOUDFLARE_R2.md). Until then new uploads keep going to Supabase.
              </span>
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line p-3">
              <dt className="text-[12px] text-fg-muted">In Cloudflare</dt>
              <dd className="text-[18px] font-semibold">{inCloud}</dd>
            </div>
            <div className="rounded-xl border border-line p-3">
              <dt className="text-[12px] text-fg-muted">Still in Supabase</dt>
              <dd className="text-[18px] font-semibold">
                {left.files} <span className="text-[12.5px] font-normal text-fg-muted">· {formatBytes(left.bytes)}</span>
              </dd>
            </div>
          </dl>
          {cloud && left.files === 0 && (
            <p className="text-[12.5px] text-success">Every file is in Cloudflare — nothing is stored in Supabase.</p>
          )}
          {cloud && left.files > 0 && (
            <div className="space-y-2">
              <MoveFilesButton remaining={left.files} />
              <p className="text-[12px] text-fg-subtle">Keep this page open until it finishes. Files also move on their own: any old file someone opens, plus 100 a day from the daily job.</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
