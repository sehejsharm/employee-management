/**
 * Runtime configuration, read lazily so a missing optional value never breaks
 * the build. Required values throw only when the feature that needs them runs.
 */
export const config = {
  appUrl: () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  /** The company's default time zone, used until a browser reports its own. */
  timeZone: () => process.env.APP_TIMEZONE || "Asia/Kolkata",
  hrWebhookSecret: () => process.env.HR_WEBHOOK_SECRET || "",
  cronSecret: () => process.env.CRON_SECRET || "",
  maxUploadBytes: () => Math.max(1, Number(process.env.MAX_UPLOAD_MB || 4)) * 1024 * 1024,
  employeeCodePrefix: () => (process.env.EMPLOYEE_CODE_PREFIX || "FR").toUpperCase(),
  isProduction: () => process.env.NODE_ENV === "production",
};
