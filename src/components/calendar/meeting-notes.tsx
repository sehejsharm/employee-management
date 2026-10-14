import { ClipboardCheck } from "lucide-react";
import { notePoints } from "@/lib/meeting-notes";
import { cn } from "@/lib/utils";

/** A founder's "Before you meet me" notes, shown wherever someone is about to meet them. */
export function MeetingNotesCallout({
  firstName,
  notes,
  self = false,
  className,
}: {
  firstName: string;
  notes: string | null | undefined;
  /** Viewing your own notes. */
  self?: boolean;
  className?: string;
}) {
  const points = notePoints(notes);
  if (!points.length) return null;
  return (
    <div className={cn("rounded-xl border border-brand/20 bg-brand-soft/40 px-3.5 py-3", className)}>
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-soft-fg">
        <ClipboardCheck className="size-4 shrink-0" />
        {self ? "What people see before meeting you" : `Before you meet ${firstName}`}
      </div>
      <ul className="mt-1.5 space-y-1">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-snug text-fg">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
            <span className="min-w-0 break-words">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
