"use client";

import * as React from "react";
import { Command } from "cmdk";
import { Check, ChevronDown, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

export interface PickablePerson {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  avatarHue: number;
  roleLabel: string;
  department: string | null;
  onLeave: boolean;
}

export function AssigneePicker({
  people,
  value,
  onChange,
  selfId,
  restrictedToSelf,
}: {
  people: PickablePerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  selfId: string;
  restrictedToSelf: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = value.map((id) => people.find((p) => p.id === id)).filter(Boolean) as PickablePerson[];
  const options = restrictedToSelf ? people.filter((p) => p.id === selfId) : people;

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const groups = React.useMemo(() => {
    const map = new Map<string, PickablePerson[]>();
    for (const p of options) {
      const key = p.department ?? "No department";
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [options]);

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-[10px] border border-line bg-surface px-2 py-1.5 text-left shadow-xs transition hover:border-line-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-ring/40"
          >
            {selected.length === 0 && (
              <span className="flex items-center gap-2 px-1.5 text-sm text-fg-subtle">
                <UserPlus className="size-4" /> Choose who this is for
              </span>
            )}
            {selected.map((p) => (
              <span key={p.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-sunken py-0.5 pl-0.5 pr-1 text-[13px] ring-1 ring-line">
                <Avatar person={p} size="xs" className="!h-6 !w-6" />
                {p.id === selfId ? "Me" : `${p.firstName} ${p.lastName}`}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(p.id);
                  }}
                  className="rounded-full p-0.5 text-fg-subtle hover:bg-surface-hover hover:text-fg"
                  aria-label={`Remove ${p.firstName}`}
                >
                  <X className="size-3" />
                </span>
              </span>
            ))}
            <ChevronDown className="ml-auto mr-1 size-4 text-fg-subtle" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px]">
          <Command loop>
            <Command.Input
              placeholder="Search people…"
              className="h-11 w-full border-b border-line bg-transparent px-3.5 text-sm outline-none placeholder:text-fg-subtle"
              autoFocus
            />
            <Command.List className="max-h-72 overflow-y-auto p-1.5">
              <Command.Empty className="py-6 text-center text-[13px] text-fg-muted">No one by that name.</Command.Empty>
              {groups.map(([dept, list]) => (
                <Command.Group
                  key={dept}
                  heading={dept}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle"
                >
                  {list.map((p) => {
                    const on = value.includes(p.id);
                    return (
                      <Command.Item
                        key={p.id}
                        value={`${p.firstName} ${p.lastName} ${p.title ?? ""} ${p.id}`}
                        onSelect={() => toggle(p.id)}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[selected=true]:bg-surface-hover"
                      >
                        <Avatar person={p} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {p.firstName} {p.lastName} {p.id === selfId && <span className="font-normal text-fg-subtle">(you)</span>}
                          </span>
                          <span className="block truncate text-xs text-fg-subtle">
                            {p.title ?? p.roleLabel}
                            {p.onLeave && " · On leave"}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "flex h-4.5 w-4.5 items-center justify-center rounded-md border transition",
                            on ? "border-brand bg-brand text-white" : "border-line-strong",
                          )}
                        >
                          {on && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
      {restrictedToSelf && (
        <p className="mt-1.5 text-xs text-fg-subtle">You can create tasks for yourself. Founders can grant you assigning rights.</p>
      )}
    </div>
  );
}
