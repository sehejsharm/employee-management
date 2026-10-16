import type { Metadata } from "next";
import { DrivePage } from "@/components/drive/drive-page";

export const metadata: Metadata = { title: "Drive" };

export default async function PersonDrivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DrivePage personId={id} />;
}
