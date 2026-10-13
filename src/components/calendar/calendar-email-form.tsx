"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setCalendarEmail } from "@/actions/meetings";

/** Where Google Calendar invitations go, if not the work email (e.g. a personal Gmail you use for your calendar). */
export function CalendarEmailForm({ workEmail, initial }: { workEmail: string; initial: string | null }) {
  const [value, setValue] = React.useState(initial ?? "");
  const [pending, start] = React.useTransition();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setCalendarEmail({ email: value });
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message);
        });
      }}
    >
      <Input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`${workEmail} (your work email)`}
        autoCapitalize="none"
        spellCheck={false}
        className="flex-1"
        aria-label="Calendar email"
      />
      <Button type="submit" variant="secondary" loading={pending} disabled={(initial ?? "") === value.trim().toLowerCase()}>
        Save
      </Button>
    </form>
  );
}
