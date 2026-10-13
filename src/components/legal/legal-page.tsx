import Link from "next/link";
import { BrandMark } from "@/components/brand/logo";
import type { PolicySection } from "@/lib/privacy-policy";

/** A public legal page (privacy policy, terms): readable without an account. */
export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: PolicySection[] }) {
  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link href="/login" className="inline-flex items-center gap-2.5">
          <BrandMark size={34} variant="tile" />
          <span className="text-[15px] font-semibold tracking-tight">Focus Realm Workspace</span>
        </Link>
        <h1 className="mt-8 text-[30px] font-semibold tracking-[-0.025em] sm:text-[36px]">{title}</h1>
        <p className="mt-2 text-[14px] text-fg-muted">Last updated {updated}</p>
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
        <p className="mt-12 flex flex-wrap gap-x-4 border-t border-line pt-6 text-[13px] text-fg-subtle">
          <span>© Focus Realm · Internal workspace</span>
          <Link href="/privacy" className="hover:text-fg">Privacy policy</Link>
          <Link href="/terms" className="hover:text-fg">Terms of service</Link>
        </p>
      </div>
    </main>
  );
}
