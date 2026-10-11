"use client";

import * as React from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { resetMemberPassword, revokeMemberSessions, updateMember } from "@/actions/people";
import { cn } from "@/lib/utils";
import { CredentialReveal } from "./credential-reveal";

type Role = "FOUNDER" | "MANAGER" | "EMPLOYEE" | "INTERN";
type Status = "ACTIVE" | "ON_LEAVE" | "INACTIVE";

export interface ManageMemberProps {
  member: {
    id: string;
    firstName: string;
    email: string;
    employeeCode: string;
    role: Role;
    title: string | null;
    status: Status;
    departmentId: string | null;
    managerId: string | null;
    canAssignTasks: boolean;
    canManageOrg: boolean;
    canManagePeople: boolean;
    source: string;
  };
  departments: { id: string; name: string }[];
  managers: { id: string; name: string }[];
  actorIsFounder: boolean;
  isSelf: boolean;
}

export function ManageMember({ member, departments, managers, actorIsFounder, isSelf }: ManageMemberProps) {
  const [form, setForm] = React.useState({
    role: member.role,
    title: member.title ?? "",
    departmentId: member.departmentId ?? "",
    managerId: member.managerId ?? "",
    status: member.status,
    canAssignTasks: member.canAssignTasks,
    canManageOrg: member.canManageOrg,
    canManagePeople: member.canManagePeople,
  });
  const [pending, start] = React.useTransition();
  const [reveal, setReveal] = React.useState<string | null>(null);
  const founderLocked = member.role === "FOUNDER" && !actorIsFounder;

  const save = () =>
    start(async () => {
      const res = await updateMember(member.id, {
        ...form,
        departmentId: form.departmentId || null,
        managerId: form.managerId || null,
      });
      if (!res.ok) toast.error(res.error);
      else toast.success(res.message);
    });

  const reset = () =>
    start(async () => {
      if (!window.confirm(`Reset ${member.firstName}'s password? They'll be signed out everywhere and need the new temporary password.`)) return;
      const res = await resetMemberPassword(member.id);
      if (!res.ok) return void toast.error(res.error);
      setReveal(res.data!.temporaryPassword);
    });

  const signOut = () =>
    start(async () => {
      const res = await revokeMemberSessions(member.id);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.message);
    });

  const isFounderRole = form.role === "FOUNDER";

  return (
    <Card>
      <CardHeader
        icon={<ShieldCheck />}
        title="Manage account"
        description={member.source === "HR_CONSOLE" ? "Provisioned by the HR console. Name and email sync from there." : "Added manually."}
      />
      <CardBody className="space-y-4">
        {founderLocked ? (
          <p className="text-[13px] text-fg-muted">Only founders can change a founder&apos;s account.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role">
                <NativeSelect value={form.role} disabled={isSelf} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
                  {(actorIsFounder || member.role === "FOUNDER") && <option value="FOUNDER">Founder</option>}
                  <option value="MANAGER">Management</option>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="INTERN">Intern</option>
                </NativeSelect>
              </Field>
              <Field label="Title">
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </Field>
              <Field label="Department">
                <NativeSelect value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}>
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Reports to">
                <NativeSelect value={form.managerId} onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}>
                  <option value="">No one (top level)</option>
                  {managers
                    .filter((m) => m.id !== member.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Status" className="sm:col-span-2">
                <NativeSelect value={form.status} disabled={isSelf} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Status }))}>
                  <option value="ACTIVE">Working</option>
                  <option value="ON_LEAVE">On leave</option>
                  <option value="INACTIVE">Former — can no longer sign in</option>
                </NativeSelect>
              </Field>
            </div>

            <div className="rounded-xl border border-line">
              {(
                [
                  ["canAssignTasks", "Assign tasks to others", "Create work for anyone in the company."],
                  ["canManageOrg", "Edit the org chart", "Move people, change titles, departments and status."],
                  ["canManagePeople", "Manage people", "Add members, reset passwords, change roles and grants."],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="flex cursor-pointer items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-0">
                  <span>
                    <span className="block text-[13.5px] font-medium">{label}</span>
                    <span className="block text-xs text-fg-subtle">{isFounderRole ? "Founders always have this." : hint}</span>
                  </span>
                  <Switch
                    checked={isFounderRole || form[key]}
                    disabled={isFounderRole}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                  />
                </label>
              ))}
            </div>

            <Button className="w-full" onClick={save} loading={pending}>
              Save changes
            </Button>

            {!isSelf && (
              <div className={cn("grid gap-2 border-t border-line pt-4", actorIsFounder && "sm:grid-cols-2")}>
                {/* Only founders: a reset hands over a working login for the account. */}
                {actorIsFounder && (
                  <Button variant="secondary" onClick={reset} disabled={pending}>
                    <KeyRound /> Reset password
                  </Button>
                )}
                <Button variant="secondary" onClick={signOut} disabled={pending}>
                  <LogOut /> Sign out everywhere
                </Button>
              </div>
            )}
          </>
        )}
      </CardBody>

      <Dialog open={!!reveal} onOpenChange={(o) => !o && setReveal(null)}>
        <DialogContent title={`New password for ${member.firstName}`} description="They've been signed out of every device.">
          {reveal && <CredentialReveal loginId={member.employeeCode} email={member.email} password={reveal} />}
          <DialogFooter>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
