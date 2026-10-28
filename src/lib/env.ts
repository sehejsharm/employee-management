/**
 * Runtime configuration, read lazily so a missing optional value never breaks
 * the build. Required values throw only when the feature that needs them runs.
 */
export const config = {
  /**
   * The Workspace's public address — used in links handed to the HR console.
   * On Vercel it defaults to the production domain (never a per-deployment URL,
   * which sits behind Deployment Protection); set APP_URL once you add a custom domain.
   */
  appUrl: () => {
    const explicit = process.env.APP_URL?.trim();
    if (explicit) return explicit.replace(/\/$/, "");
    const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return production ? `https://${production}` : "http://localhost:3000";
  },
  /** The company's default time zone, used until a browser reports its own. */
  timeZone: () => process.env.APP_TIMEZONE || "Asia/Kolkata",
  hrWebhookSecret: () => process.env.HR_WEBHOOK_SECRET || "",
  cronSecret: () => process.env.CRON_SECRET || "",
  /**
   * The single Focus Realm website: this app's address is the front door, and
   * the HR console (/hr) and Sales CRM (/crm) are served here through
   * src/proxy.ts, authenticated to each other with FOCUS_REALM_HUB_SECRET.
   * Unset HR_CONSOLE_ORIGIN or CRM_ORIGIN and that app's routing, launch route
   * and switcher entry simply don't appear — nothing else changes. This is a
   * different secret from HR_WEBHOOK_SECRET above, which is for the one-way
   * HR → Workspace events webhook, not this routing.
   */
  hubSecret: () => process.env.FOCUS_REALM_HUB_SECRET || "",
  hrConsoleOrigin: () => process.env.HR_CONSOLE_ORIGIN?.trim().replace(/\/$/, "") || "",
  crmOrigin: () => process.env.CRM_ORIGIN?.trim().replace(/\/$/, "") || "",
  /**
   * Largest upload, in bytes. Vercel rejects request bodies over 4.5 MB before
   * the app runs, so 4 MB is the ceiling there (multipart adds a little); the
   * Server Action body limit (5 MB, next.config.ts) caps it elsewhere.
   */
  maxUploadBytes: () => {
    const mb = Number(process.env.MAX_UPLOAD_MB);
    const wanted = Number.isFinite(mb) && mb > 0 ? mb : 4;
    const ceiling = process.env.VERCEL ? 4 : 4.75;
    return Math.floor(Math.min(wanted, ceiling) * 1024 * 1024);
  },
  employeeCodePrefix: () => (process.env.EMPLOYEE_CODE_PREFIX || "FR").toUpperCase(),
  isProduction: () => process.env.NODE_ENV === "production",
};
