"use client";

import * as React from "react";
import { Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DEPARTMENT_COLOR_KEYS, deptColor } from "@/components/ui/badge";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { deleteDepartment, saveDepartment } from "@/actions/org";
import { cn } from "@/lib/utils";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{value}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded-md p-1.5 text-fg-subtle hover:bg-surface-hover hover:text-fg"
        aria-label="Copy"
      >
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

export function DepartmentDialog({
  department,
}: {
  department?: { id: string; name: string; color: string; description: string | null };
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(department?.name ?? "");
  const [color, setColor] = React.useState(department?.color ?? "blue");
  const [description, setDescription] = React.useState(department?.description ?? "");
  const [pending, start] = React.useTransition();

  const save = () =>
    start(async () => {
      const res = await saveDepartment(department?.id ?? null, { name, color, description });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      if (!department) {
        setName("");
        setDescription("");
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {department ? (
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${department.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> New department
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={department ? "Edit department" : "New department"}>
        <div className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Description" optional>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {DEPARTMENT_COLOR_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setColor(k)}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface", deptColor(k).dot, color === k && "ring-2 ring-brand")}
                  aria-label={k}
                >
                  {color === k && <Check className="size-3.5 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save} loading={pending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDepartment({ id, name, members }: { id: string; name: string; members: number }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete ${name}`}
      onClick={async () => {
        if (!window.confirm(`Delete ${name}?${members ? ` Its ${members} member${members === 1 ? "" : "s"} will have no department.` : ""}`)) return;
        const res = await deleteDepartment(id);
        if (res.ok) toast.success(res.message);
        else toast.error(res.error);
      }}
    >
      <Trash2 />
    </Button>
  );
}
