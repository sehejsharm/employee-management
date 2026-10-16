import "server-only";
import { randomUUID } from "node:crypto";
import { AwsClient } from "aws4fetch";

/**
 * Where uploaded files live.
 *
 * With Cloudflare R2 set up (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET), files go to the bucket: 10 GB free, no
 * charge for downloads. Without it they stay in Postgres, as before, so the app
 * works with nothing extra configured. Files already in Postgres can be moved
 * across from Admin → File storage (or by the daily job).
 */

function env() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  // R2_ENDPOINT is only for other S3-compatible stores (and tests).
  const endpoint = process.env.R2_ENDPOINT?.trim().replace(/\/$/, "") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  return { accessKeyId, secretAccessKey, bucket, endpoint };
}

/** Is Cloudflare R2 set up? */
export function cloudStorageConfigured() {
  const e = env();
  return !!(e.accessKeyId && e.secretAccessKey && e.bucket && e.endpoint);
}

let client: AwsClient | null = null;
function r2() {
  const e = env();
  client ??= new AwsClient({ accessKeyId: e.accessKeyId!, secretAccessKey: e.secretAccessKey!, service: "s3", region: "auto" });
  return client;
}

function objectUrl(key: string) {
  const e = env();
  return `${e.endpoint}/${encodeURIComponent(e.bucket!)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** A key that reads well in the bucket: drive/<person>/<id>-<file name>. */
export function objectKey(folder: string, fileName: string) {
  const safe = fileName.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-120) || "file";
  return `${folder}/${randomUUID()}-${safe}`;
}

async function check(res: Response, what: string) {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  throw new Error(`Cloud storage ${what} failed (${res.status}): ${text.slice(0, 200)}`);
}

export async function putObject(key: string, bytes: Uint8Array, contentType: string) {
  const res = await r2().fetch(objectUrl(key), {
    method: "PUT",
    body: bytes as BodyInit,
    headers: { "Content-Type": contentType || "application/octet-stream" },
    signal: AbortSignal.timeout(30_000),
  });
  await check(res, "upload");
}

export async function deleteObject(key: string) {
  const res = await r2().fetch(objectUrl(key), { method: "DELETE", signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return;
  await check(res, "delete");
}

/** Deletes objects without failing the caller: a leftover object only costs a little space. */
export async function deleteObjectsQuietly(keys: (string | null | undefined)[]) {
  await Promise.all(keys.filter((k): k is string => !!k).map((k) => deleteObject(k).catch((e) => console.error("Couldn't delete stored file", k, e))));
}

/**
 * A short-lived link to download (or view) an object straight from R2, so big
 * files never pass through the app's own servers.
 */
export async function signedDownloadUrl(key: string, opts: { fileName: string; contentType: string; inline: boolean; expiresIn?: number }) {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(opts.expiresIn ?? 300));
  url.searchParams.set("response-content-type", opts.inline ? opts.contentType : "application/octet-stream");
  url.searchParams.set("response-content-disposition", `${opts.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`);
  url.searchParams.set("response-cache-control", "private, max-age=300");
  const signed = await r2().sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

/**
 * Stores file bytes: in R2 when it's set up (returns the key), otherwise in the
 * database row (returns the bytes to save there).
 */
export async function storeFile(folder: string, fileName: string, bytes: Uint8Array, contentType: string): Promise<{ storageKey: string; data: null } | { storageKey: null; data: Uint8Array<ArrayBuffer> }> {
  if (!cloudStorageConfigured()) return { storageKey: null, data: new Uint8Array(bytes) };
  const key = objectKey(folder, fileName);
  await putObject(key, bytes, contentType);
  return { storageKey: key, data: null };
}
