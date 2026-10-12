"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { changeMemberEmail, releaseMemberEmail } from "@/actions/people";

/** For founders and anyone the person reports to: change their email whenever needed. */
export function ChangeEmailDialog({
  userId,
  firstName,
  email,
  fromHr,
  setManually,
}: {
  userId: string;
  firstName: string;
  email: string;
  /** Provisioned by the HR console, so its updates could change the email. */
  fromHr: boolean;
  /** Already changed here: HR console updates leave it alone. */
  setManually: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(email);
  const [pending, start] = React.useTransition();

  const save = () =>
    start(async () => {
      const res = await changeMemberEmail(userId, { email: value });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
    });

  const release = () =>
    start(async () => {
      const res = await releaseMemberEmail(userId);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(email);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="xs" className="ml-1 align-middle">
          <Pencil /> Change
        </Button>
      </DialogTrigger>
      <DialogContent
        size="sm"
        title={`Change ${firstName}'s email`}
        description={`${firstName} keeps signing in with their employee ID — only the email changes. They'll be notified.`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Label htmlFor="new-email">Email</Label>
          <Input
            id="new-email"
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
          <p className="mt-2 text-[12.5px] text-fg-muted">
            It can be the same as a colleague&apos;s — shared emails are fine.
            {fromHr && " An email changed here is kept even if the HR console later sends a different one."}
          </p>
          {setManually && fromHr && (
            <div className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-[12.5px] text-fg-muted">
              This email was set in the Workspace, so HR console updates don&apos;t change it.{" "}
              <button type="button" onClick={release} disabled={pending} className="font-medium text-brand hover:underline">
                Let the HR console manage it again
              </button>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} disabled={!value.trim() || value.trim().toLowerCase() === email}>
              Save email
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
