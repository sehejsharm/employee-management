/** Regenerates docs/PRIVACY_POLICY.md and docs/TERMS_OF_SERVICE.md from their sources in src/lib. */
import { writeFileSync } from "node:fs";
import { POLICY_UPDATED, legalContact, legalMarkdown, policySections } from "../src/lib/privacy-policy";
import { TERMS_UPDATED, termsSections } from "../src/lib/terms-of-service";

const contact = legalContact();
writeFileSync("docs/PRIVACY_POLICY.md", legalMarkdown("Privacy Policy", POLICY_UPDATED, policySections(contact)));
writeFileSync("docs/TERMS_OF_SERVICE.md", legalMarkdown("Terms of Service", TERMS_UPDATED, termsSections(contact)));
console.log("Wrote docs/PRIVACY_POLICY.md and docs/TERMS_OF_SERVICE.md");
