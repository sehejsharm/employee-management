import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { POLICY_UPDATED, legalContact, policySections } from "@/lib/privacy-policy";

export const metadata: Metadata = { title: "Privacy policy" };

/** Public: Google's consent screen and anyone signing in can read it without an account. */
export default function PrivacyPage() {
  return <LegalPage title="Privacy policy" updated={POLICY_UPDATED} sections={policySections(legalContact())} />;
}
