"use client";

import * as React from "react";
import Link from "next/link";
import { Mail, Search, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

export interface EmailGroup {
  email: string;
  users: {
    id: string;
    firstName: string;
    lastName: string;
    title: string | null;
    avatarHue: number;
    employeeCode: string;
    status: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
    department: string | null;
  }[];
}

/** Who uses which email. Shared mailboxes first, your own highlighted. */
export function EmailDirectory({ groups, selfId }: { groups: EmailGroup[]; selfId: string }) {
  const [query, setQuery] = React.useState("");
  const [show, setShow] = React.useState<"shared" | "all">("shared");

  const q = query.trim().toLowerCase();
  const list = groups.filter((g) => {
    if (show === "shared" && g.users.length < 2) return false;
    if (!q) return true;
    return (
      g.email.includes(q) ||
      g.users.some((u) => `${u.firstName} ${u.lastName} ${u.employeeCode} ${u.title ?? ""}`.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search an email, name or ID"
            className="h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[13.5px] shadow-xs outline-none placeholder:text-fg-subtle focus:border-brand focus:ring-4 focus:ring-ring/40"
          />
        </div>
        <Segmented
          layoutId="email-dir-show"
          size="sm"
          className="sm:ml-auto"
          value={show}
          onChange={setShow}
          options={[
            { value: "shared", label: "Shared emails" },
            { value: "all", label: "Every email" },
          ]}
        />
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Mail />}
          title={show === "shared" && !q ? "No shared emails" : "Nothing matches"}
          description={show === "shared" && !q ? "Everyone currently has an email of their own." : "Try a different search."}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((g) => {
            const mine = g.users.some((u) => u.id === selfId);
            const shared = g.users.length > 1;
            return (
              <li
                key={g.email}
                className={cn(
                  "rounded-2xl border bg-surface p-4 shadow-sm",
                  mine ? "border-brand/40 ring-2 ring-brand/15" : "border-line",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      shared ? "bg-info-soft text-info" : "bg-surface-sunken text-fg-muted",
                    )}
                  >
                    {shared ? <UsersRound className="size-[18px]" /> : <Mail className="size-[18px]" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a href={`mailto:${g.email}`} className="block break-all text-[14px] font-semibold hover:text-brand">
                      {g.email}
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-muted">
                      {shared ? (
                        <span className="rounded-full bg-info-soft px-2 py-0.5 font-semibold text-info">Shared by {g.users.length}</span>
                      ) : (
                        <span>One person</span>
                      )}
                      {mine && <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-soft-fg">Your email</span>}
                    </div>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 border-t border-line pt-3">
                  {g.users.map((u) => (
                    <li key={u.id}>
                      <Link href={`/people/${u.id}`} className="group flex items-center gap-2.5 rounded-lg px-1 py-1 transition hover:bg-surface-hover">
                        <Avatar person={u} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium group-hover:text-brand">
                            {u.firstName} {u.lastName}
                            {u.id === selfId && <span className="ml-1 font-normal text-fg-subtle">(you)</span>}
                          </span>
                          <span className="block truncate text-[11.5px] text-fg-subtle">
                            {u.title ?? u.department ?? ""}
                            {u.status === "ON_LEAVE" && " · On leave"}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{u.employeeCode}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
