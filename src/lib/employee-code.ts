import { db } from "@/lib/db";
import { config } from "@/lib/env";

/** Normalises what someone types as a login ID: "fr-0042" → "FR-0042". */
export function normaliseEmployeeCode(value: string) {
  return value.trim().toUpperCase();
}

export function isEmployeeCode(value: string) {
  return /^[A-Z][A-Z0-9]{1,9}-[A-Z0-9-]{1,16}$/.test(normaliseEmployeeCode(value));
}

/** The next free code in the FR-0001 sequence. */
export async function nextEmployeeCode() {
  const prefix = config.employeeCodePrefix();
  const rows = await db.user.findMany({
    where: { employeeCode: { startsWith: `${prefix}-` } },
    select: { employeeCode: true },
  });
  let max = 0;
  for (const { employeeCode } of rows) {
    const n = Number(employeeCode.slice(prefix.length + 1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}
