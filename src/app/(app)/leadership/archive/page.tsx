import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Download, ExternalLink, FileText, HardDrive, Link2, NotebookPen, Search, StickyNote } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_META } from "@/components/tasks/meta";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { isFounder } from "@/lib/permissions";
import { formatDate } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";
import { cloudStorageConfigured } from "@/lib/storage";
import { filesStillInDatabase } from "@/lib/storage-move";
import { cn, formatBytes } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Work archive" };

const PAGE_SIZE = 30;

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "done", label: "Done" },
  { key: "review", label: "Waiting for review" },
  { key: "open", label: "Still open" },
] as const;

const person = { select: { id: true, firstName: true, lastName: true, avatarHue: true } } as const;
const attachmentSelect = {
  id: true,
  kind: true,
  title: true,
  url: true,
  content: true,
  fileName: true,
  size: true,
  createdAt: true,
  createdBy: person,
} satisfies Prisma.AttachmentSelect;

const PROOF = {
  ACCEPTED: { label: "Accepted", className: "bg-success-soft text-success" },
  SUBMITTED: { label: "Waiting for review", className: "bg-info-soft text-info" },
  CHANGES_REQUESTED: { label: "Sent back", className: "bg-warning-soft text-warning" },
} as const;

/**
 * Founders only: every task that has anything handed in or attached — from
 * everyone, done or not, archived included — with each hand-in and its files.
 */
export default async function WorkArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; person?: string; status?: string; page?: string }>;
}) {
  const user = await requireUser();
  if (!isFounder(user)) notFound();
  const tz = await getTimeZone();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const status = STATUS_FILTERS.some((s) => s.key === sp.status) ? sp.status! : "all";
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.page ?? "1", 10) || 1));
  const personId = sp.person || "";

  const number = Number.parseInt(q.replace(/^t-?/i, ""), 10);
  const and: Prisma.TaskWhereInput[] = [
    // Only tasks with something in them: a hand-in, a file, a link or a note.
    { OR: [{ submissions: { some: {} } }, { attachments: { some: {} } }] },
  ];
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { attachments: { some: { OR: [{ title: { contains: q, mode: "insensitive" } }, { fileName: { contains: q, mode: "insensitive" } }] } } },
        ...(Number.isSafeInteger(number) && number > 0 && number < 2_000_000_000 ? [{ number }] : []),
      ],
    });
  }
  if (personId) {
    and.push({
      OR: [{ assignees: { some: { userId: personId } } }, { submissions: { some: { submittedById: personId } } }, { attachments: { some: { createdById: personId } } }],
    });
  }
  if (status === "done") and.push({ status: "DONE" });
  if (status === "review") and.push({ status: "IN_REVIEW" });
  if (status === "open") and.push({ status: { notIn: ["DONE", "IN_REVIEW"] } });
  const where: Prisma.TaskWhereInput = { AND: and };

  const cloud = cloudStorageConfigured();
  const [total, tasks, people, totals, inSupabase, inCloud] = await Promise.all([
    db.task.count({ where }),
    db.task.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        archivedAt: true,
        updatedAt: true,
        createdBy: person,
        assignees: { select: { user: person } },
        submissions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            summary: true,
            createdAt: true,
            reviewNote: true,
            submittedBy: person,
            reviewedBy: person,
            attachments: { orderBy: { createdAt: "asc" }, select: attachmentSelect },
          },
        },
        attachments: { where: { submissionId: null }, orderBy: { createdAt: "asc" }, select: attachmentSelect },
      },
    }),
    db.user.findMany({ orderBy: [{ firstName: "asc" }, { lastName: "asc" }], select: { id: true, firstName: true, lastName: true, status: true } }),
    Promise.all([
      db.submission.count(),
      db.attachment.count({ where: { kind: "FILE" } }),
      db.attachment.aggregate({ where: { kind: "FILE" }, _sum: { size: true } }),
    ]),
    filesStillInDatabase(),
    db.fileBlob.count({ where: { storageKey: { not: null } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (overrides: Record<string, string | number>) => {
    const params = new URLSearchParams({ ...(q ? { q } : {}), ...(personId ? { person: personId } : {}), status, page: String(page) });
    for (const [k, v] of Object.entries(overrides)) params.set(k, String(v));
    if (params.get("status") === "all") params.delete("status");
    if (params.get("page") === "1") params.delete("page");
    return `/leadership/archive?${params}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Leadership"
        title="Work archive"
        description="Every task with something handed in or attached — from everyone, done or not, archived included. Open any hand-in to see the write-up, documents and links."
      />
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <NotebookPen className="size-4" /> {totals[0]} hand-in{totals[0] === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FileText className="size-4" /> {totals[1]} document{totals[1] === 1 ? "" : "s"} · {formatBytes(totals[2]._sum.size ?? 0)}
        </span>
        <Link
          href="/admin?tab=storage"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium",
            cloud && inSupabase.files === 0 ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
          )}
        >
          <HardDrive className="size-3.5" />
          {!cloud
            ? "Cloudflare not connected — files are going to Supabase"
            : inSupabase.files === 0
              ? `All ${inCloud} files stored in Cloudflare`
              : `${inCloud} in Cloudflare · ${inSupabase.files} still in Supabase — move them`}
        </Link>
      </div>

      <form action="/leadership/archive" className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search tasks, file names or T-number"
            aria-label="Search the archive"
            className="h-10 w-full min-w-0 rounded-xl border border-line bg-surface pl-9 pr-3 text-base shadow-xs outline-none focus:border-brand focus:ring-4 focus:ring-ring/40 sm:text-sm"
          />
        </div>
        <select
          name="person"
          defaultValue={personId}
          aria-label="Whose work"
          className="h-10 min-w-0 rounded-xl border border-line bg-surface px-3 text-base shadow-xs sm:w-56 sm:text-sm"
        >
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.firstName} {p.lastName}
              {p.status === "INACTIVE" ? " (left)" : ""}
            </option>
          ))}
        </select>
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <button type="submit" className="h-10 shrink-0 rounded-xl bg-brand px-4 text-[13.5px] font-medium text-white shadow-brand hover:bg-brand/90">
          Search
        </button>
      </form>
      <div className="no-scrollbar -mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s.key}
            href={href({ status: s.key, page: 1 })}
            aria-current={status === s.key ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition",
              status === s.key ? "border-brand/30 bg-brand-soft text-brand-soft-fg" : "border-line bg-surface text-fg-muted hover:text-fg",
            )}
          >
            {s.label}
          </Link>
        ))}
        {personId && (
          <Link href={`/people/${personId}/drive`} className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-fg-muted hover:text-fg">
            <HardDrive className="size-3.5" /> Their drive
          </Link>
        )}
      </div>

      {tasks.length === 0 ? (
        <Card>
          <EmptyState icon={<Archive />} title="Nothing found" description={q || personId || status !== "all" ? "Try another search or filter." : "Nothing has been handed in or attached yet."} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => {
            const meta = STATUS_META[t.status];
            const fileCount = t.attachments.length + t.submissions.reduce((n, s) => n + s.attachments.length, 0);
            return (
              <li key={t.id}>
                <Card>
                  <CardBody className="space-y-3 pt-4">
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                      <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 text-[15px] font-semibold leading-snug wrap-anywhere hover:underline">
                        <span className="text-fg-muted">T-{t.number}</span> · {t.title}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {t.archivedAt && <Badge tone="neutral">Archived</Badge>}
                      </div>
                    </div>
                    <p className="text-[12.5px] text-fg-muted">
                      {t.assignees.length ? `On it: ${t.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(", ")}` : "Nobody assigned"} · Assigned by{" "}
                      {t.createdBy.firstName} · {t.submissions.length} hand-in{t.submissions.length === 1 ? "" : "s"} · {fileCount} item{fileCount === 1 ? "" : "s"}
                    </p>

                    {t.submissions.map((s, i) => (
                      <details key={s.id} open={i === 0} className="group rounded-xl border border-line">
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5">
                          <Avatar person={s.submittedBy} size="xs" />
                          <span className="text-[13.5px] font-medium">
                            {s.submittedBy.firstName} {s.submittedBy.lastName}
                          </span>
                          <span className="text-[12.5px] text-fg-muted" suppressHydrationWarning>
                            handed in {formatDate(s.createdAt, tz, { year: true })}
                          </span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", PROOF[s.status].className)}>{PROOF[s.status].label}</span>
                          <span className="ml-auto text-[12px] text-fg-subtle group-open:hidden">Show</span>
                        </summary>
                        <div className="space-y-2 border-t border-line px-3 py-3">
                          {s.summary && <p className="whitespace-pre-wrap text-[13px] wrap-anywhere">{s.summary}</p>}
                          <Items items={s.attachments} tz={tz} />
                          {s.reviewNote && (
                            <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[12.5px] text-fg-muted wrap-anywhere">
                              <span className="font-medium text-fg">{s.reviewedBy ? `${s.reviewedBy.firstName}'s note` : "Review note"}:</span> {s.reviewNote}
                            </p>
                          )}
                        </div>
                      </details>
                    ))}

                    {t.attachments.length > 0 && (
                      <div>
                        <div className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-fg-subtle">Task material</div>
                        <Items items={t.attachments} tz={tz} showAuthor />
                      </div>
                    )}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-[13px]" aria-label="Pages">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="rounded-xl border border-line px-3 py-2 hover:bg-surface-hover">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-fg-muted">
            Page {page} of {pages} · {total} tasks
          </span>
          {page < pages ? (
            <Link href={href({ page: page + 1 })} className="rounded-xl border border-line px-3 py-2 hover:bg-surface-hover">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

type Item = Prisma.AttachmentGetPayload<{ select: typeof attachmentSelect }>;

/** Documents, links and notes, each openable. */
function Items({ items, tz, showAuthor }: { items: Item[]; tz: string; showAuthor?: boolean }) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {items.map((a) => {
        const Icon = a.kind === "FILE" ? FileText : a.kind === "LINK" ? Link2 : StickyNote;
        return (
          <li key={a.id} className="flex items-start gap-2.5 px-3 py-2">
            <Icon className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium wrap-anywhere">{a.title}</div>
              <div className="text-[12px] text-fg-muted" suppressHydrationWarning>
                {showAuthor ? `${a.createdBy.firstName} · ` : ""}
                {formatDate(a.createdAt, tz, { year: true })}
                {a.size ? ` · ${formatBytes(a.size)}` : ""}
              </div>
              {a.kind === "NOTE" && a.content && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[12.5px] text-fg-muted wrap-anywhere">{a.content}</p>}
            </div>
            {a.kind === "FILE" && (
              <div className="flex shrink-0 gap-1.5">
                <a href={`/api/files/${a.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-[12.5px] font-medium hover:bg-surface-hover">
                  <ExternalLink className="size-3.5" /> <span className="hidden sm:inline">Open</span>
                </a>
                <a href={`/api/files/${a.id}?download=1`} aria-label={`Download ${a.fileName ?? a.title}`} className="inline-flex h-8 items-center rounded-lg border border-line px-2 hover:bg-surface-hover">
                  <Download className="size-3.5" />
                </a>
              </div>
            )}
            {a.kind === "LINK" && a.url && (
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 text-[12.5px] font-medium hover:bg-surface-hover">
                <ExternalLink className="size-3.5" /> <span className="hidden sm:inline">Open link</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
