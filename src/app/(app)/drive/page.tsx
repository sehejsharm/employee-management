import type { Metadata } from "next";
import { DrivePage } from "@/components/drive/drive-page";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "My drive" };

export default async function MyDrivePage() {
  const user = await requireUser();
  return <DrivePage personId={user.id} />;
}
