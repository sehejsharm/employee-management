"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { BrandMark } from "@/components/brand/logo";

/**
 * Catches failures in the sign-in pages and the app shell's own layout (the
 * (app) boundary can't wrap the layout above it). Inside the root layout, so
 * the brand styles apply — unlike global-error, the true last resort.
 */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[var(--glow)]" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-50 [mask-image:radial-gradient(60%_50%_at_50%_45%,var(--brand),transparent)]" />
      <div className="absolute left-6 top-6 flex items-center gap-2.5">
        <BrandMark size={32} variant="tile" />
        <span className="text-[15px] font-semibold tracking-tight">Focus Realm</span>
      </div>

      <p className="relative text-[12px] font-semibold uppercase tracking-[0.2em] text-brand">Error 503 · Out of reach</p>
      <h1 className="relative mt-3 max-w-xl text-balance text-[30px] font-semibold tracking-[-0.03em] sm:text-[38px]">
        The workspace can&apos;t reach its data right now.
      </h1>
      <p className="relative mt-3 max-w-md text-[15px] leading-relaxed text-fg-muted">
        Give it a moment and try again. Founders: the details are in Vercel → Logs
        {error.digest ? (
          <>
            {" "}
            (reference <span className="font-mono text-[13px]">{error.digest}</span>)
          </>
        ) : null}
        .
      </p>
      <div className="relative mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-[14.5px] font-medium text-brand-fg shadow-brand transition hover:bg-brand-hover active:scale-[0.98]"
        >
          <RotateCcw className="size-4" /> Try again
        </button>
        <Link
          href="/login"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-[14.5px] font-medium shadow-xs transition hover:border-line-strong active:scale-[0.98]"
        >
          Go to sign-in
        </Link>
      </div>
    </main>
  );
}
