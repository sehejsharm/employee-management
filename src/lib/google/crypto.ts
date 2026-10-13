import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Google refresh tokens are as good as a password to someone's calendar, so
 * they're encrypted at rest with AES-256-GCM. The key is GOOGLE_TOKEN_KEY
 * (any long random string); without it, one is derived from the OAuth client
 * secret so the feature still works — set a dedicated key in production.
 */
function key() {
  const material = process.env.GOOGLE_TOKEN_KEY?.trim() || `fr-google-tokens:${process.env.GOOGLE_CLIENT_SECRET ?? ""}`;
  return createHash("sha256").update(material).digest();
}

export function sealToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

export function openToken(sealed: string) {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised token format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
