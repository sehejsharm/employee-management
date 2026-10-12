import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmailDirectory } from "@/components/people/email-directory";
import { SharedEmailNotice } from "@/components/people/shared-email-notice";
import { requireUser } from "@/lib/auth/current-user";
import { emailDirectory } from "@/lib/shared-email";

export const metadata: Metadata = { title: "Who uses which email" };

export default async function EmailsPage() {
  const user = await requireUser();
  const groups = await emailDirectory();
  const shared = groups.filter((g) => g.users.length > 1);
  const mine = groups.find((g) => g.email === user.email);

  return (
    <>
      <Link href="/people" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted transition hover:text-fg">
        <ChevronLeft className="size-4" /> People
      </Link>
      <PageHeader
        eyebrow="Company"
        title="Who uses which email"
        description={
          shared.length
            ? `${shared.length} ${shared.length === 1 ? "email is" : "emails are"} shared by more than one person. Everyone signs in with their own employee ID, never an email.`
            : "Every email in the company and who it belongs to. Everyone signs in with their own employee ID, never an email."
        }
      />
      {mine && (
        <SharedEmailNotice
          className="mb-6"
          self
          email={mine.email}
          others={mine.users.filter((u) => u.id !== user.id)}
        />
      )}
      <EmailDirectory
        selfId={user.id}
        groups={groups.map((g) => ({
          email: g.email,
          users: g.users.map((u) => ({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            title: u.title,
            avatarHue: u.avatarHue,
            employeeCode: u.employeeCode,
            status: u.status,
            department: u.department?.name ?? null,
          })),
        }))}
      />
    </>
  );
}
