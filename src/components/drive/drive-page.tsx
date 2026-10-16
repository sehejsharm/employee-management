import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, HardDrive, Link2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { NoClearance } from "@/components/clearance/no-clearance";
import { DriveView } from "@/components/drive/drive-view";
import { requireUser } from "@/lib/auth/current-user";
import { canSeeWorkOf, clearanceBlock, getClearedIds, pendingClearanceWaitingOn } from "@/lib/clearance";
import { db } from "@/lib/db";
import { driveFor } from "@/lib/drive";
import { isFounder } from "@/lib/permissions";
import { getTimeZone } from "@/lib/tz.server";
import { formatBytes } from "@/lib/utils";

/** A person's drive: everything they've handed in or added to tasks, kept for good. */
export async function DrivePage({ personId }: { personId: string }) {
  const viewer = await requireUser();
  const person = await db.user.findUnique({ where: { id: personId }, select: { id: true, firstName: true, lastName: true, role: true, status: true } });
  if (!person) notFound();
  const self = person.id === viewer.id;
  const [cleared, tz] = await Promise.all([getClearedIds(viewer), getTimeZone()]);

  const back = self ? null : (
    <Link href={`/people/${person.id}`} className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted transition hover:text-fg">
      <ChevronLeft className="size-4" /> {person.firstName} {person.lastName}
    </Link>
  );

  if (!canSeeWorkOf(viewer, person, cleared)) {
    const block = clearanceBlock(person);
    const pending = block.requestable ? await pendingClearanceWaitingOn(viewer.id, person) : null;
    return (
      <>
        {back}
        <PageHeader eyebrow="Drive" title={`${person.firstName}'s drive`} />
        <NoClearance subject={person} reason={block.reason} requestable={block.requestable} pending={pending} canRequest={!isFounder(viewer)} />
      </>
    );
  }

  const items = await driveFor(viewer, person.id, cleared);
  const files = items.filter((i) => i.kind === "FILE");
  const bytes = files.reduce((n, i) => n + (i.size ?? 0), 0);
  const links = items.filter((i) => i.kind === "LINK").length;

  return (
    <>
      {back}
      <PageHeader
        eyebrow="Drive"
        title={self ? "My drive" : `${person.firstName} ${person.lastName}'s drive`}
        description={
          self
            ? "Everything you've handed in or added to tasks — documents, links and write-ups. It stays here, even after the work is accepted and done."
            : `Everything ${person.firstName} has handed in or added to tasks${person.status === "INACTIVE" ? " (they've since left)" : ""}. It stays here, even after the work is accepted and done.`
        }
      />
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="size-4" /> {files.length} document{files.length === 1 ? "" : "s"} · {formatBytes(bytes)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Link2 className="size-4" /> {links} link{links === 1 ? "" : "s"}
        </span>
        {!self && !isFounder(viewer) && (
          <span className="inline-flex items-center gap-1.5">
            <HardDrive className="size-4" /> Showing what your clearance covers
          </span>
        )}
      </div>
      <DriveView items={items} tz={tz} />
    </>
  );
}
