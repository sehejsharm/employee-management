"use client";

import * as React from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{label}</div>
        <div className={cn("truncate text-[15px] font-semibold", mono && "font-mono tracking-wide")}>{value}</div>
      </div>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`${label} copied`);
          window.setTimeout(() => setCopied(false), 1600);
        }}
        className="rounded-lg p-2 text-fg-subtle transition hover:bg-surface-hover hover:text-fg"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

/** Shows a one-time credential. Nothing here is stored — close it and it's gone. */
export function CredentialReveal({ loginId, email, password }: { loginId: string; email: string; password: string }) {
  return (
    <div className="space-y-2.5">
      <CopyRow label="Employee ID" value={loginId} mono />
      <CopyRow label="Work email" value={email} />
      <CopyRow label="Temporary password" value={password} mono />
      <div className="flex gap-2.5 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-warning">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          This password is shown once and isn&apos;t stored anywhere readable. Share it privately (not in a group chat). They&apos;ll be
          asked to choose their own the first time they sign in.
        </p>
      </div>
    </div>
  );
}
