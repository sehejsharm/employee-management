import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

const COST = 12;

/** A real bcrypt hash of a random string, so unknown-user logins take as long as real ones. */
const TIMING_DUMMY_HASH = "$2b$12$snuQiXkZlMlP.a4CbEmFOOztFffBjGpSHyGY8j7nOg/QOrGDH7QJ6";

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined) {
  if (!hash) {
    await bcrypt.compare(plain, TIMING_DUMMY_HASH).catch(() => false);
    return false;
  }
  return bcrypt.compare(plain, hash).catch(() => false);
}

/** True for $2a$/$2b$/$2y$ bcrypt hashes — what the HR console may send instead of a plaintext password. */
export function isBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

/**
 * Temporary passwords people type by hand: no ambiguous characters (O/0,
 * l/1/I), grouped for readability, ~80 bits of entropy.
 */
export function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${group()}-${group()}-${group()}-${group()}`;
}

export { PASSWORD_RULES, passwordProblems } from "./password-rules";
