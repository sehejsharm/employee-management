"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { MeetingNotesCallout } from "@/components/calendar/meeting-notes";
import { setMeetingNotes } from "@/actions/meetings";
import { MEETING_NOTES_MAX, NOTE_SUGGESTIONS, notePoints } from "@/lib/meeting-notes";

/** Founders: what everyone should know before meeting you. */
export function MeetingNotesForm({ firstName, initial }: { firstName: string; initial: string | null }) {
  const [value, setValue] = React.useState(initial ?? "");
  const [saved, setSaved] = React.useState(initial ?? "");
  const [pending, start] = React.useTransition();
  const have = new Set(notePoints(value).map((p) => p.toLowerCase()));

  const add = (point: string) => setValue((v) => (v.trim() ? `${v.replace(/\s+$/, "")}\n${point}` : point));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setMeetingNotes({ notes: value });
          if (!res.ok) return void toast.error(res.error);
          setSaved(value.trim());
          toast.success(res.message);
        });
      }}
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        maxLength={MEETING_NOTES_MAX}
        placeholder={"One point per line, e.g.\nJoin 2 minutes early\nKeep your camera on\nBring a notebook and pen"}
        aria-label="Before you meet me"
      />
      <div className="flex flex-wrap gap-1.5">
        {NOTE_SUGGESTIONS.filter((s) => !have.has(s.toLowerCase())).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-fg-muted transition hover:border-brand/40 hover:text-brand"
          >
            <Plus className="size-3" /> {s}
          </button>
        ))}
      </div>
      {value.trim() && <MeetingNotesCallout firstName={firstName} notes={value} self />}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] tabular text-fg-subtle">
          {value.length}/{MEETING_NOTES_MAX}
        </span>
        <Button type="submit" variant="secondary" loading={pending} disabled={value.trim() === saved.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}
