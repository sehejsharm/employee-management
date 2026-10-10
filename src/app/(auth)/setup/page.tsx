import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setupTokenConfigured, workspaceStatus } from "@/lib/setup";
import { SetupNotice } from "../setup-notice";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up the workspace" };
export const dynamic = "force-dynamic";

/** One-time first-founder setup. Gone for good once a founder exists. */
export default async function SetupPage() {
  const status = await workspaceStatus();
  if (status === "ready") notFound();
  if (status !== "needs-founder" || !setupTokenConfigured()) return <SetupNotice status={status} setupOpen={false} />;
  return <SetupForm />;
}
