import "server-only";
import { db } from "@/lib/db";
import { cloudStorageConfigured, deleteObjectsQuietly, objectKey, putObject } from "@/lib/storage";

/** How many files are still kept in the database rather than in Cloudflare R2. */
export async function filesStillInDatabase() {
  const [files, pdfs, bytes] = await Promise.all([
    db.fileBlob.count({ where: { storageKey: null, data: { not: null } } }),
    db.announcement.count({ where: { pdfKey: null, pdf: { not: null } } }),
    db.$queryRaw<{ total: bigint | null }[]>`
      SELECT (COALESCE((SELECT SUM(octet_length("data")) FROM "FileBlob" WHERE "data" IS NOT NULL), 0)
            + COALESCE((SELECT SUM(octet_length("pdf")) FROM "Announcement" WHERE "pdf" IS NOT NULL), 0))::bigint AS total`,
  ]);
  return { files: files + pdfs, bytes: Number(bytes[0]?.total ?? 0) };
}

/**
 * Moves up to `limit` files from the database to R2: uploads each one, then
 * points the row at it and clears the bytes. Safe to run again and from two
 * places at once — a file is only switched over if it's still in the database.
 */
export async function moveFilesToCloud(limit = 25) {
  if (!cloudStorageConfigured()) return { moved: 0, failed: 0 };
  let moved = 0;
  let failed = 0;

  const blobs = await db.fileBlob.findMany({
    where: { storageKey: null, data: { not: null } },
    take: limit,
    select: { id: true, data: true, attachment: { select: { createdById: true, fileName: true, mimeType: true } } },
  });
  for (const blob of blobs) {
    const key = objectKey(`drive/${blob.attachment?.createdById ?? "unassigned"}`, blob.attachment?.fileName ?? "file");
    try {
      await putObject(key, blob.data!, blob.attachment?.mimeType ?? "application/octet-stream");
      const done = await db.fileBlob.updateMany({ where: { id: blob.id, storageKey: null }, data: { storageKey: key, data: null } });
      if (done.count === 0) await deleteObjectsQuietly([key]);
      else moved++;
    } catch (error) {
      console.error("Couldn't move a file to cloud storage", blob.id, error);
      await deleteObjectsQuietly([key]);
      failed++;
    }
  }

  const left = Math.max(0, limit - blobs.length);
  if (left > 0) {
    const pdfs = await db.announcement.findMany({ where: { pdfKey: null, pdf: { not: null } }, take: left, select: { id: true, pdf: true, pdfName: true } });
    for (const a of pdfs) {
      const key = objectKey("announcements", a.pdfName ?? "announcement.pdf");
      try {
        await putObject(key, a.pdf!, "application/pdf");
        const done = await db.announcement.updateMany({ where: { id: a.id, pdfKey: null }, data: { pdfKey: key, pdf: null } });
        if (done.count === 0) await deleteObjectsQuietly([key]);
        else moved++;
      } catch (error) {
        console.error("Couldn't move an announcement PDF to cloud storage", a.id, error);
        await deleteObjectsQuietly([key]);
        failed++;
      }
    }
  }
  return { moved, failed };
}

/** Moves one file to R2 (used when an older file is opened). Never throws. */
export async function moveFileToCloud(blobId: string) {
  if (!cloudStorageConfigured()) return false;
  const blob = await db.fileBlob.findUnique({
    where: { id: blobId },
    select: { data: true, storageKey: true, attachment: { select: { createdById: true, fileName: true, mimeType: true } } },
  });
  if (!blob?.data || blob.storageKey) return false;
  const key = objectKey(`drive/${blob.attachment?.createdById ?? "unassigned"}`, blob.attachment?.fileName ?? "file");
  try {
    await putObject(key, blob.data, blob.attachment?.mimeType ?? "application/octet-stream");
    const done = await db.fileBlob.updateMany({ where: { id: blobId, storageKey: null }, data: { storageKey: key, data: null } });
    if (done.count === 0) await deleteObjectsQuietly([key]);
    return done.count > 0;
  } catch (error) {
    console.error("Couldn't move a file to cloud storage", blobId, error);
    await deleteObjectsQuietly([key]);
    return false;
  }
}
