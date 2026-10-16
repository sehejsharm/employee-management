"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { canAdminister } from "@/lib/permissions";
import { cloudStorageConfigured } from "@/lib/storage";
import { filesStillInDatabase, moveFilesToCloud } from "@/lib/storage-move";
import type { ActionResult } from "@/lib/utils";

/** Admin → File storage: moves the next batch of files from the database to Cloudflare R2. */
export async function moveFilesNow(): Promise<ActionResult<{ remaining: number }>> {
  const user = await requireUser();
  if (!canAdminister(user)) return { ok: false, error: "Only admins can do this." };
  if (!cloudStorageConfigured()) return { ok: false, error: "Cloudflare R2 isn't set up yet." };
  const { moved, failed } = await moveFilesToCloud(25);
  const { files: remaining } = await filesStillInDatabase();
  if (moved) await audit({ actorId: user.id, action: "storage.moved", targetType: "workspace", summary: `Moved ${moved} file${moved === 1 ? "" : "s"} to Cloudflare R2` });
  refresh();
  if (failed && !moved) return { ok: false, error: "Cloudflare refused the files — check the R2 keys and bucket name." };
  return { ok: true, data: { remaining }, message: remaining ? `Moved ${moved}. ${remaining} to go.` : `Moved ${moved} — everything is in Cloudflare now.` };
}
