import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Set your password" };

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");
  return <WelcomeForm firstName={user.firstName} employeeCode={user.employeeCode} />;
}
