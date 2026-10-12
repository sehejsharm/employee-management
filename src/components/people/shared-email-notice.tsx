import Link from "next/link";
import { Mail, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface EmailSharer {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  avatarHue: number;
  employeeCode: string;
}

/** "You share this email with …" — so nobody acts on a message that was meant for a colleague. */
export function SharedEmailNotice({
  email,
  others,
  self,
  name,
  className,
}: {
  email: string;
  others: EmailSharer[];
  /** True on your own screens: "You share…"; otherwise "{name} shares…". */
  self: boolean;
  name?: string;
  className?: string;
}) {
  if (others.length === 0) return null;
  return (
    <div className={cn("rounded-2xl border border-info/25 bg-info-soft/60 p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info">
          <UsersRound className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug">
            {self ? "You share" : `${name ?? "This person"} shares`}{" "}
            <span className="inline-flex max-w-full items-center gap-1 break-all font-semibold">
              <Mail className="size-3.5 shrink-0 text-info" />
              {email}
            </span>{" "}
            with {others.length} {others.length === 1 ? "colleague" : "colleagues"}.
          </p>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            Check who a message is for before acting on it. Everyone signs in with their own employee ID.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {others.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/people/${p.id}`}
                  className="inline-flex h-8 max-w-full items-center gap-2 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-3 text-[12.5px] shadow-xs transition hover:border-brand/40 hover:text-brand"
                >
                  <Avatar person={p} size="sm" />
                  <span className="truncate font-medium">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="font-mono text-[11px] text-fg-subtle">{p.employeeCode}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
