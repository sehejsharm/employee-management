import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { setupTokenConfigured, workspaceStatus } from "@/lib/setup";
import { SetupNotice } from "../setup-notice";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
// Never prerendered: on a fresh deployment the answer changes once a database is attached.
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const status = await workspaceStatus();
  if (status !== "ready") return <SetupNotice status={status} setupOpen={setupTokenConfigured()} />;

  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/welcome" : user.mustCompleteProfile ? "/complete-profile" : "/dashboard");
  const { next } = await searchParams;
  return <LoginForm next={next ?? ""} />;
}
