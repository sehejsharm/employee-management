"use client";

import * as React from "react";
import { Clock, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { requestClearance } from "@/actions/clearance";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * What someone sees in place of work they aren't cleared for. Colleagues' work
 * can be requested (it goes to that person and to the founders); founders'
 * work can't.
 */
export function NoClearance({
  subject,
  reason,
  requestable,
  pending,
  canRequest,
  className,
}: {
  subject: { id: string; firstName: string };
  reason: string;
  requestable: boolean;
  /** An open request from this viewer, if any: who it's still waiting on. */
  pending?: string | null;
  /** Founders never need to ask; everyone else can. */
  canRequest: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-8 text-center", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-fg-muted ring-1 ring-line">
        <ShieldX className="size-5" />
      </span>
      <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">No clearance given</p>
      <p className="mt-1.5 max-w-sm text-[14px] text-fg-muted">{reason}</p>
      {requestable && canRequest && (
        <div className="mt-5">
          {pending ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft px-3 py-1.5 text-[12.5px] font-medium text-info">
              <Clock className="size-3.5" /> Request sent · waiting on {pending}
            </span>
          ) : (
            <RequestClearanceButton subject={subject} />
          )}
        </div>
      )}
    </div>
  );
}

export function RequestClearanceButton({ subject, variant = "secondary" }: { subject: { id: string; firstName: string }; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const res = await requestClearance({ subjectId: subject.id, reason });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message ?? "Request sent.");
      setOpen(false);
      setReason("");
    } catch {
      toast.error("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          Request clearance
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Ask to see ${subject.firstName}'s work`}
        description={`Your request goes to ${subject.firstName} and to the founders. You'll get clearance once ${subject.firstName} agrees and a founder approves.`}
      >
        <Field label="Why do you need to see it?" htmlFor="clearance-reason" hint="At least 10 characters.">
          <Textarea
            id="clearance-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder={`e.g. I'm picking up the vendor follow-ups ${subject.firstName} started.`}
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={send} loading={busy} disabled={reason.trim().length < 10}>
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
