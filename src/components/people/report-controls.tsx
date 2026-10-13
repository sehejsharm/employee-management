"use client";

import * as React from "react";
import { FileDown, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveWorkReportNow, setLastDay } from "@/actions/reports";

export function ReportActions({ userId }: { userId: string }) {
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button asChild>
        <a href={`/api/reports/${userId}`} download>
          <FileDown /> Download PDF
        </a>
      </Button>
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await saveWorkReportNow(userId);
            if (!res.ok) return void toast.error(res.error);
            toast.success(res.message);
          })
        }
      >
        <Save /> Save a copy
      </Button>
    </>
  );
}

export function LastDayForm({ userId, initial }: { userId: string; initial: string | null }) {
  const [value, setValue] = React.useState(initial ?? "");
  const [pending, start] = React.useTransition();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setLastDay(userId, { date: value });
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message);
        });
      }}
    >
      <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} className="sm:w-48" aria-label="Last day" />
      <Button type="submit" variant="secondary" loading={pending} disabled={value === (initial ?? "")}>
        Save last day
      </Button>
    </form>
  );
}
