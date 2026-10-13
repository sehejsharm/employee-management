import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Complete your profile" };

export default async function CompleteProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/welcome");
  if (!user.mustCompleteProfile) redirect("/dashboard");
  const current = await db.user.findUnique({ where: { id: user.id }, select: { phone: true, location: true } });
  return <ProfileForm firstName={user.firstName} phone={current?.phone ?? ""} location={current?.location ?? ""} />;
}
