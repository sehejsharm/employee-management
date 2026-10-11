"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { grantWorkVisibility, revokeWorkVisibility } from "@/actions/visibility";

export interface GrantPerson {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  avatarHue: number;
  /** Why the grant no longer counts (the person left, or became a founder), if it doesn't. */
  inactiveReason?: string | null;
}

const label = "mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle";

/**
 * Founders only: choose whose work this person may see. View only, revocable
 * at any time, and never covers founders' work. The server re-checks all of it.
 */
export function WorkVisibilityManager({
  person,
  canSee,
  seenBy,
  candidates,
  canAdd,
}: {
  person: { id: string; firstName: string };
  canSee: GrantPerson[];
  seenBy: GrantPerson[];
  candidates: GrantPerson[];
  /** False once the person has left: grants can still be removed, not added. */
  canAdd: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [ownerId, setOwnerId] = React.useState("");
  const options = candidates.filter((c) => !canSee.some((g) => g.id === c.id));

  const grant = () =>
    start(async () => {
      if (!ownerId) return void toast.error("Pick someone first.");
      const res = await grantWorkVisibility(person.id, ownerId);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOwnerId("");
    });

  const revoke = (viewerId: string, ownerId: string) =>
    start(async () => {
      const res = await revokeWorkVisibility(viewerId, ownerId);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.message);
    });

  return (
    <Card>
      <CardHeader
        icon={<Eye />}
        title="Work visibility"
        description={`Choose whose work ${person.firstName} can see. It's view only, takes effect immediately, and never includes founders' work.`}
      />
      <CardBody className="space-y-5">
        <div>
          <div className={label}>{person.firstName} can see the work of</div>
          {canSee.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">Nobody else. {person.firstName} sees only their own work.</p>
          ) : (
            <GrantList people={canSee} disabled={pending} onRemove={(id) => revoke(person.id, id)} />
          )}
          {canAdd ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="min-w-0 flex-1">
                <NativeSelect
                  aria-label={`Let ${person.firstName} see someone's work`}
                  value={ownerId}
                  disabled={pending || options.length === 0}
                  onChange={(e) => setOwnerId(e.target.value)}
                >
                  <option value="">{options.length ? "Choose a person…" : "Everyone eligible is already added"}</option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                      {c.title ? ` — ${c.title}` : ""}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button variant="secondary" onClick={grant} loading={pending} disabled={!ownerId}>
                <Plus /> Allow
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-fg-subtle">{person.firstName} has left, so nobody&apos;s work can be shared with them.</p>
          )}
        </div>

        <div className="border-t border-line pt-4">
          <div className={label}>Who can see {person.firstName}&apos;s work</div>
          {seenBy.length === 0 ? (
            <p className="text-[13px] text-fg-subtle">Founders, and the people on each task with {person.firstName}. Nobody else.</p>
          ) : (
            <GrantList people={seenBy} disabled={pending} onRemove={(id) => revoke(id, person.id)} />
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** The signed-in person's own view of whose work they have been allowed to see. */
export function SharedWithMe({ people }: { people: GrantPerson[] }) {
  return (
    <Card>
      <CardHeader icon={<Eye />} title="Work shared with you" description="A founder has let you see these people's tasks. It's view only." />
      <CardBody>
        {people.length === 0 ? (
          <p className="text-[13px] text-fg-subtle">Nobody&apos;s work is shared with you. Only founders can change that.</p>
        ) : (
          <GrantList people={people} />
        )}
      </CardBody>
    </Card>
  );
}

function GrantList({ people, disabled, onRemove }: { people: GrantPerson[]; disabled?: boolean; onRemove?: (id: string) => void }) {
  return (
    <ul className="space-y-1">
      {people.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-surface-hover">
          <Link href={`/people/${p.id}`} className="group flex min-w-0 flex-1 items-center gap-3">
            <Avatar person={p} size="sm" dimmed={!!p.inactiveReason} />
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-medium group-hover:text-brand">
                {p.firstName} {p.lastName}
              </span>
              {p.title && <span className="block truncate text-xs text-fg-subtle">{p.title}</span>}
            </span>
          </Link>
          {p.inactiveReason && <Badge tone="neutral">{p.inactiveReason}</Badge>}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              onClick={() => onRemove(p.id)}
              aria-label={`Remove ${p.firstName}`}
              title="Remove"
            >
              <X />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
