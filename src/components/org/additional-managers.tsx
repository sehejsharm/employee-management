"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { addAdditionalManager, removeAdditionalManager } from "@/actions/org";

export interface BossOption {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  avatarHue: number;
}

/**
 * The extra people someone reports to, besides their main manager. Adding or
 * removing one notifies the people involved; loops are refused on the server.
 */
export function AdditionalManagersEditor({
  personId,
  personFirstName,
  current,
  candidates,
}: {
  personId: string;
  personFirstName: string;
  current: BossOption[];
  /** Everyone who could be added: current people who aren't already a boss and wouldn't create a loop. */
  candidates: BossOption[];
}) {
  const [pick, setPick] = React.useState("");
  const [pending, start] = React.useTransition();

  const add = () =>
    start(async () => {
      if (!pick) return;
      const res = await addAdditionalManager(personId, pick);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setPick("");
    });

  const remove = (managerId: string) =>
    start(async () => {
      const res = await removeAdditionalManager(personId, managerId);
      if (!res.ok) return void toast.error(res.error);
      if (res.message) toast.success(res.message);
    });

  return (
    <div>
      {current.length > 0 && (
        <ul className="mb-2.5 space-y-1.5">
          {current.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-2 py-1.5">
              <Avatar person={m} size="sm" />
              <Link href={`/people/${m.id}`} className="min-w-0 flex-1 truncate text-[13px] font-medium hover:text-brand">
                {m.firstName} {m.lastName}
                {m.title && <span className="font-normal text-fg-subtle"> · {m.title}</span>}
              </Link>
              <button
                type="button"
                onClick={() => remove(m.id)}
                disabled={pending}
                className="rounded-md p-1 text-fg-subtle transition hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                aria-label={`${personFirstName} no longer reports to ${m.firstName}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-0 flex-1" aria-label="Add another person they report to">
          <option value="">{current.length ? "Add another boss…" : "Add a second boss…"}</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
              {c.title ? ` — ${c.title}` : ""}
            </option>
          ))}
        </NativeSelect>
        <Button type="button" variant="secondary" onClick={add} disabled={!pick} loading={pending}>
          <Plus /> Add
        </Button>
      </div>
    </div>
  );
}
