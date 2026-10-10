import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { config } from "@/lib/env";
import { TZ_COOKIE, isValidTimeZone } from "@/lib/time";

/** The viewer's time zone for server rendering. */
export const getTimeZone = cache(async () => {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  if (isValidTimeZone(tz)) return tz;
  // APP_TIMEZONE must be an IANA name ("Asia/Kolkata", not "IST"); a bad value falls back rather than crashing every page.
  const fallback = config.timeZone();
  return isValidTimeZone(fallback) ? fallback : "Asia/Kolkata";
});
