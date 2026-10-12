"use client";

import * as React from "react";
import { UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { reassignTask } from "@/actions/tasks";
import { AssigneePicker, type PickablePerson } from "./assignee-picker";

/** Hand a task to someone else, or add people to it, straight from the task page. */
export function ReassignDialog({
  taskId,
  taskRef,
  people,
  assigneeIds,
  leadId,
  selfId,
  restrictedToSelf,
  className,
  variant = "secondary",
}: {
  taskId: string;
  taskRef: string;
  people: PickablePerson[];
  assigneeIds: string[];
  leadId: string | null;
  selfId: string;
  restrictedToSelf: boolean;
  className?: string;
  variant?: "secondary" | "soft";
}) {
  const [open, setOpen] = React.useState(false);
  const [ids, setIds] = React.useState(assigneeIds);
  const [lead, setLead] = React.useState<string | null>(leadId);
  const [pending, start] = React.useTransition();

  // Start from the task as it is now every time the dialog opens.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setIds(assigneeIds);
      setLead(leadId);
    }
    setOpen(next);
  };

  const effectiveLead = lead && ids.includes(lead) ? lead : (ids[0] ?? null);
  const before = new Set(assigneeIds);
  const added = ids.filter((id) => !before.has(id)).length;
  const removed = assigneeIds.filter((id) => !ids.includes(id)).length;
  const changed = added > 0 || removed > 0 || effectiveLead !== leadId;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.firstName ?? "someone";

  const save = () =>
    start(async () => {
      const res = await reassignTask(taskId, { assigneeIds: ids, leadId: effectiveLead ?? undefined });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant} className={className}>
          <UserRoundPlus /> Reassign / add people
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Who's on ${taskRef}`}
        description="Add people, take people off, or hand the lead to someone else. Everyone affected is notified."
      >
        <AssigneePicker
          people={people}
          value={ids}
          onChange={setIds}
          leadId={effectiveLead}
          onLeadChange={setLead}
          selfId={selfId}
          restrictedToSelf={restrictedToSelf}
        />
        {changed && ids.length > 0 && (
          <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-[12.5px] text-fg-muted">
            {[
              added > 0 && `${added} added`,
              removed > 0 && `${removed} taken off`,
              effectiveLead !== leadId && effectiveLead && `${nameOf(effectiveLead)} will lead`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save} loading={pending} disabled={!changed || ids.length === 0}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
