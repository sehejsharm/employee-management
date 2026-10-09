import type { Metadata } from "next";
import { Bell, KeyRound, Palette, Target, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { DesktopAlerts } from "@/components/app/desktop-alerts";
import { AppearanceForm, PasswordForm, ProfileForm, SessionsList } from "@/components/app/settings-forms";
import { FocusEditor } from "@/components/dashboard/widgets";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { currentSessionTokenHash } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [profile, sessions, currentHash] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { phone: true, location: true, bio: true, avatarHue: true, focus: true } }),
    db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, device: true, createdAt: true, tokenHash: true },
    }),
    currentSessionTokenHash(),
  ]);

  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" description={`${user.firstName} ${user.lastName} · ${user.employeeCode} · ${user.email}`} />
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader icon={<Target />} title="Your focus" description="Shown on the org chart, your profile and the leadership board." />
          <CardBody>
            <FocusEditor initial={profile.focus} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<UserRound />} title="Profile" description="Your name, email and role come from HR. Everything else is yours." />
          <CardBody>
            <ProfileForm
              initial={{
                firstName: user.firstName,
                lastName: user.lastName,
                phone: profile.phone ?? "",
                location: profile.location ?? "",
                bio: profile.bio ?? "",
                avatarHue: profile.avatarHue,
              }}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<Palette />} title="Appearance" />
          <CardBody>
            <AppearanceForm />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<Bell />} title="Notifications" description="In-app alerts are always on. Desktop alerts are up to you." />
          <CardBody>
            <DesktopAlerts />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<KeyRound />} title="Password & sessions" />
          <CardBody className="space-y-6">
            <PasswordForm />
            <div>
              <div className="mb-2 text-[13px] font-semibold">Where you&apos;re signed in</div>
              <SessionsList
                sessions={sessions.map((s) => ({ id: s.id, device: s.device, createdAt: s.createdAt.toISOString(), current: s.tokenHash === currentHash }))}
              />
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
