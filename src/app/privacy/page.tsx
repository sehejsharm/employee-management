import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand/logo";
import { POLICY_UPDATED, policySections } from "@/lib/privacy-policy";

export const metadata: Metadata = { title: "Privacy policy" };

/** Who to write to about privacy: PRIVACY_CONTACT_EMAIL, or the founders. */
function contact() {
  const email = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  return email || "the Focus Realm founders";
}

/** Public: Google's consent screen and anyone signing in can read it without an account. */
export default function PrivacyPage() {
  const sections = policySections(contact());
  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link href="/login" className="inline-flex items-center gap-2.5">
          <BrandMark size={34} variant="tile" />
          <span className="text-[15px] font-semibold tracking-tight">Focus Realm Workspace</span>
        </Link>
        <h1 className="mt-8 text-[30px] font-semibold tracking-[-0.025em] sm:text-[36px]">Privacy policy</h1>
        <p className="mt-2 text-[14px] text-fg-muted">Last updated {POLICY_UPDATED}</p>
        <div className="mt-8 space-y-8">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{s.title}</h2>
              {s.body?.map((p) => (
                <p key={p} className="mt-2.5 text-[15px] leading-relaxed text-fg-muted">
                  {p}
                </p>
              ))}
              {s.list && (
                <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-fg-muted">
                  {s.list.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        <p className="mt-12 border-t border-line pt-6 text-[13px] text-fg-subtle">© Focus Realm · Internal workspace</p>
      </div>
    </main>
  );
}
