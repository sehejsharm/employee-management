import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { cloudStorageConfigured, objectKey, storeFile } = await import("@/lib/storage");

const R2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"];
afterEach(() => R2.forEach((k) => delete process.env[k]));

describe("file storage", () => {
  it("keeps files in the database until Cloudflare R2 is set up", async () => {
    expect(cloudStorageConfigured()).toBe(false);
    const stored = await storeFile("drive/u1", "brief.pdf", new Uint8Array([1, 2, 3]), "application/pdf");
    expect(stored.storageKey).toBeNull();
    expect([...stored.data!]).toEqual([1, 2, 3]);
  });

  it("is set up once all four R2 settings are there", () => {
    Object.assign(process.env, { R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret" });
    expect(cloudStorageConfigured()).toBe(false);
    process.env.R2_BUCKET = "files";
    expect(cloudStorageConfigured()).toBe(true);
  });

  it("makes safe, unique keys that keep the file name readable", () => {
    const a = objectKey("drive/u1", "Q3 report (final) ✓.pdf");
    const b = objectKey("drive/u1", "Q3 report (final) ✓.pdf");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^drive\/u1\/[0-9a-f-]{36}-Q3_report_final_.pdf$/);
    expect(objectKey("x", "../../etc/passwd")).not.toContain("/../");
  });
});
