import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HR console → Workspace webhook signing.
 *
 *   X-FR-Timestamp: <unix seconds>
 *   X-FR-Signature: v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 *
 * The timestamp is inside the signed string, so a captured request cannot be
 * replayed later; event ids are stored, so it cannot be replayed sooner either.
 */
export const SIGNATURE_HEADER = "x-fr-signature";
export const TIMESTAMP_HEADER = "x-fr-timestamp";
export const TOLERANCE_SECONDS = 5 * 60;

export function sign(secret: string, timestamp: number | string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function signatureHeader(secret: string, timestamp: number | string, rawBody: string) {
  return `v1=${sign(secret, timestamp, rawBody)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifySignature(input: {
  secret: string;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  now?: number;
}): VerifyResult {
  if (!input.secret) return { ok: false, reason: "Integration is not configured (HR_WEBHOOK_SECRET is empty)." };
  if (!input.signature || !input.timestamp) return { ok: false, reason: "Missing signature headers." };

  const ts = Number(input.timestamp);
  if (!Number.isInteger(ts)) return { ok: false, reason: "Malformed timestamp." };
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return { ok: false, reason: "Timestamp outside the allowed window." };

  const expected = Buffer.from(sign(input.secret, ts, input.rawBody), "hex");
  // Accept a comma-separated list so the secret can be rotated without downtime.
  const candidates = input.signature
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => Buffer.from(part.slice(3), "hex"));

  const match = candidates.some((c) => c.length === expected.length && timingSafeEqual(c, expected));
  return match ? { ok: true } : { ok: false, reason: "Signature mismatch." };
}
