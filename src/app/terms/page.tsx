import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { legalContact } from "@/lib/privacy-policy";
import { TERMS_UPDATED, termsSections } from "@/lib/terms-of-service";

export const metadata: Metadata = { title: "Terms of service" };

/** Public, like the privacy policy: linked from sign-in and Google's consent screen. */
export default function TermsPage() {
  return <LegalPage title="Terms of service" updated={TERMS_UPDATED} sections={termsSections(legalContact())} />;
}
