import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, ChevronLeft, FileDown, FileText, Sparkles, Target, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LastDayForm, ReportActions } from "@/components/people/report-controls";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { isFounder } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";
import { buildWorkReport } from "@/lib/work-report";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Work report" };

const STATUS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", BLOCKED: "Blocked", DONE: "Done" };
const REASON = { LAST_DAY: "Filed on their last day", OFFBOARDED: "Filed when they left", MANUAL: "Saved by a founder" } as const;

/** Founders only: someone's work, live, plus every copy filed so far. */
export default async function WorkReportPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  if (!isFounder(viewer)) notFound();
  const { id } = await params;
  const tz = await getTimeZone();
  const [report, saved, person] = await Promise.all([
    buildWorkReport(id),
    db.workReport.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { id: true, reason: true, createdAt: true } }),
    db.user.findUnique({ where: { id }, select: { lastDay: true } }),
  ]);
  if (!report || !person) notFound();
  const s = report.stats;
  const tiles = [
    { label: "Tasks done", value: `${s.completed}/${s.total}`, icon: CheckCircle2, tone: "text-success" },
    { label: "On time", value: s.onTimeRate === null ? "—" : `${s.onTimeRate}%`, icon: CalendarClock, tone: "text-brand" },
    { label: "Accepted first time", value: s.firstTimeAcceptance === null ? "—" : `${s.firstTimeAcceptance}%`, icon: Target, tone: "text-info" },
    { label: "Overdue now", value: String(s.overdue), icon: TriangleAlert, tone: s.overdue ? "text-danger" : "text-fg-muted" },
  ];

  return (
    <>
      <Link href={`/people/${id}`} className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted transition hover:text-fg">
        <ChevronLeft className="size-4" /> {report.person.name}
      </Link>
      <PageHeader
        eyebrow="Work report · founders only"
        title={report.person.name}
        description={`${[report.person.title ?? report.person.role, report.person.department, report.person.employeeCode].filter(Boolean).join(" · ")}. ${formatDate(new Date(report.period.from), tz, { year: true })} – ${formatDate(new Date(report.period.to), tz, { year: true })} (${s.days} days). Live — updates as their work does.`}
        actions={<ReportActions userId={id} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <t.icon className={cn("size-5", t.tone)} />
            <div className="mt-2 text-[24px] font-semibold tabular tracking-tight">{t.value}</div>
            <div className="text-[12.5px] text-fg-muted">{t.label}</div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader icon={<Sparkles />} title="Highlights" />
            <CardBody>
              <ul className="space-y-1.5 text-[13.5px]">
                {report.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    {h}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<FileText />} title={`Tasks · ${report.tasks.length}`} description="Newest deadlines first. Delivered = first handed in." />
            <CardBody className="px-0 pb-2">
              {report.tasks.length === 0 ? (
                <EmptyState icon={<FileText />} title="No tasks yet" description="Nothing has been assigned to them." compact />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-[13px]">
                    <thead className="text-[11px] uppercase tracking-wider text-fg-subtle">
                      <tr className="border-b border-line">
                        <th className="px-5 py-2 font-semibold">Task</th>
                        <th className="px-3 py-2 font-semibold">Role</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Due</th>
                        <th className="px-5 py-2 font-semibold">Delivered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.tasks.map((t) => (
                        <tr key={t.ref} className="border-b border-line last:border-0">
                          <td className="max-w-[320px] px-5 py-2.5">
                            <div className="truncate font-medium">
                              <span className="mr-1.5 font-mono text-[11.5px] text-fg-subtle">{t.ref}</span>
                              {t.title}
                            </div>
                            <div className="truncate text-[11.5px] text-fg-subtle">Assigned by {t.assignedBy}</div>
                          </td>
                          <td className="px-3 py-2.5 text-fg-muted">{t.role === "LEAD" ? "Lead" : "Follower"}</td>
                          <td className="px-3 py-2.5 text-fg-muted">{STATUS[t.status]}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-fg-muted">{formatDate(new Date(t.dueAt), tz)}</td>
                          <td className={cn("whitespace-nowrap px-5 py-2.5", t.onTime === true ? "text-success" : t.onTime === false ? "text-danger" : "text-fg-subtle")}>
                            {t.deliveredAt ? `${formatDate(new Date(t.deliveredAt), tz)}${t.onTime === true ? " · on time" : t.onTime === false ? " · late" : ""}` : t.onTime === false ? "Overdue" : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader icon={<CalendarClock />} title="Last day" description="Their report is filed that morning and every founder is notified. Leaving it empty is fine — it's also filed if they're offboarded." />
            <CardBody>
              <LastDayForm userId={id} initial={person.lastDay ? person.lastDay.toISOString().slice(0, 10) : null} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={<FileDown />} title="Filed reports" description="Exactly what the report said at the time." />
            <CardBody>
              {saved.length === 0 ? (
                <p className="text-[13px] text-fg-subtle">None yet.</p>
              ) : (
                <ul className="space-y-2">
                  {saved.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium">{REASON[r.reason]}</div>
                        <div className="text-[12px] text-fg-subtle" suppressHydrationWarning>
                          {formatDateTime(r.createdAt, tz)}
                        </div>
                      </div>
                      <a href={`/api/reports/${id}?saved=${r.id}`} download className="text-[12.5px] font-semibold text-brand hover:underline">
                        PDF
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
