/**
 * Sends a signed event to the workspace exactly as the HR console would.
 * Use it to test the integration end to end.
 *
 *   npm run hr:simulate -- ping
 *   npm run hr:simulate -- create "Priya Menon" priya.menon@focusrealm.com INTERN "Marketing Intern"
 *   npm run hr:simulate -- offboard <externalId>
 *
 * Reads APP_URL and HR_WEBHOOK_SECRET from .env.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { signatureHeader } from "../src/lib/hr/signature";

async function send(type: string, data: Record<string, unknown> = {}) {
  const url = `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/integrations/hr/events`;
  const secret = process.env.HR_WEBHOOK_SECRET;
  if (!secret) throw new Error("HR_WEBHOOK_SECRET is not set.");

  const body = JSON.stringify({ id: `evt_${randomUUID()}`, type, createdAt: new Date().toISOString(), data });
  const timestamp = Math.floor(Date.now() / 1000);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FR-Timestamp": String(timestamp),
      "X-FR-Signature": signatureHeader(secret, timestamp, body),
    },
    body,
  });
  console.log(`${res.status} ${res.statusText}`);
  console.log(JSON.stringify(await res.json(), null, 2));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "ping":
      await send("ping");
      break;
    case "create": {
      const [fullName, email, role = "INTERN", title = "Intern", department = "Marketing"] = args;
      if (!fullName || !email) throw new Error('Usage: create "Full Name" email [ROLE] [title] [department]');
      await send("employee.created", {
        externalId: `hr_${email.split("@")[0].replace(/\W/g, "_")}`,
        fullName,
        email,
        role,
        title,
        department,
        startDate: new Date().toISOString(),
      });
      break;
    }
    case "offboard":
      await send("employee.offboarded", { externalId: args[0], reason: "End of internship" });
      break;
    case "restore":
      await send("employee.restored", { externalId: args[0] });
      break;
    case "reset":
      await send("employee.credentials_reset", { externalId: args[0] });
      break;
    default:
      console.log("Commands: ping | create <name> <email> [role] [title] [department] | offboard <externalId> | restore <externalId> | reset <externalId>");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
