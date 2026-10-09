"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <TriangleAlert className="size-6" />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">Something went wrong on our side</h1>
      <p className="mt-2 max-w-md text-[14px] text-fg-muted">
        The page couldn&apos;t load. Nothing you did caused this — try again, and if it keeps happening, let a founder know.
        {error.digest && <span className="mt-2 block font-mono text-xs text-fg-subtle">Reference: {error.digest}</span>}
      </p>
      <Button className="mt-6" onClick={reset}>
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}
