/** Regenerates docs/PRIVACY_POLICY.md from src/lib/privacy-policy.ts. */
import { writeFileSync } from "node:fs";
import { policyMarkdown } from "../src/lib/privacy-policy";

writeFileSync("docs/PRIVACY_POLICY.md", policyMarkdown(process.env.PRIVACY_CONTACT_EMAIL || "the Focus Realm founders"));
console.log("Wrote docs/PRIVACY_POLICY.md");
