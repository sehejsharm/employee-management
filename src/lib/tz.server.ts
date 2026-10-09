import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { config } from "@/lib/env";
import { TZ_COOKIE, isValidTimeZone } from "@/lib/time";

/** The viewer's time zone for server rendering. */
export const getTimeZone = cache(async () => {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  return isValidTimeZone(tz) ? tz : config.timeZone();
});
