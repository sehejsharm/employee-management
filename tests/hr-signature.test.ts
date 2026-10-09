import { describe, expect, it } from "vitest";
import { sign, signatureHeader, verifySignature } from "@/lib/hr/signature";

const secret = "test-secret";
const body = JSON.stringify({ id: "evt_123456", type: "ping" });
const now = 1_760_000_000_000;
const ts = Math.floor(now / 1000);

describe("HR webhook signatures", () => {
  it("accepts a correctly signed, fresh request", () => {
    expect(verifySignature({ secret, rawBody: body, signature: signatureHeader(secret, ts, body), timestamp: String(ts), now })).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const r = verifySignature({ secret, rawBody: body + " ", signature: signatureHeader(secret, ts, body), timestamp: String(ts), now });
    expect(r.ok).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const r = verifySignature({ secret, rawBody: body, signature: signatureHeader("other", ts, body), timestamp: String(ts), now });
    expect(r).toEqual({ ok: false, reason: "Signature mismatch." });
  });

  it("rejects stale and future timestamps (replay window)", () => {
    for (const t of [ts - 301, ts + 301]) {
      const r = verifySignature({ secret, rawBody: body, signature: signatureHeader(secret, t, body), timestamp: String(t), now });
      expect(r).toEqual({ ok: false, reason: "Timestamp outside the allowed window." });
    }
  });

  it("rejects missing headers and an unconfigured secret", () => {
    expect(verifySignature({ secret, rawBody: body, signature: null, timestamp: null, now }).ok).toBe(false);
    expect(verifySignature({ secret: "", rawBody: body, signature: "v1=00", timestamp: String(ts), now }).ok).toBe(false);
  });

  it("accepts any one of several signatures, for secret rotation", () => {
    const header = `v1=${sign("old-secret", ts, body)}, v1=${sign(secret, ts, body)}`;
    expect(verifySignature({ secret, rawBody: body, signature: header, timestamp: String(ts), now }).ok).toBe(true);
  });
});
