import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { BrandMark } from "@/components/brand/logo";
import { LostOrbit } from "@/components/app/lost-orbit";

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[var(--glow)]" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-50 [mask-image:radial-gradient(60%_50%_at_50%_45%,#000,transparent)]" />
      <Link href="/dashboard" className="absolute left-6 top-6 flex items-center gap-2.5">
        <BrandMark size={32} variant="tile" />
        <span className="text-[15px] font-semibold tracking-tight">Focus Realm</span>
      </Link>

      <LostOrbit />

      <p className="relative mt-10 text-[12px] font-semibold uppercase tracking-[0.2em] text-brand">Error 404 · Out of focus</p>
      <h1 className="relative mt-3 text-balance text-[34px] font-semibold tracking-[-0.03em] sm:text-[44px]">
        This page drifted out of the realm.
      </h1>
      <p className="relative mt-3 max-w-md text-[15px] leading-relaxed text-fg-muted">
        The link may be old, the task may have been deleted, or it&apos;s something you don&apos;t have access to. Everything else is
        right where you left it.
      </p>
      <div className="relative mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[14.5px] font-medium text-white shadow-brand transition hover:bg-brand-hover active:scale-[0.98]"
        >
          <ArrowLeft className="size-4" /> Back to home
        </Link>
        <Link
          href="/tasks"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-[14.5px] font-medium shadow-xs transition hover:border-line-strong active:scale-[0.98]"
        >
          <Compass className="size-4" /> Go to my tasks
        </Link>
      </div>
    </main>
  );
}
