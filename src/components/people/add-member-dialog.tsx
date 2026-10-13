"use client";

import * as React from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { addMember } from "@/actions/people";
import { CredentialReveal } from "./credential-reveal";

export function AddMemberDialog({
  departments,
  managers,
  canAddFounder,
}: {
  departments: { id: string; name: string }[];
  managers: { id: string; name: string; title: string | null }[];
  canAddFounder: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [created, setCreated] = React.useState<{ employeeCode: string; email: string; temporaryPassword: string; name: string } | null>(null);
  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "INTERN" as "FOUNDER" | "MANAGER" | "EMPLOYEE" | "INTERN",
    title: "",
    departmentId: "",
    managerId: "",
    employeeCode: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await addMember({ ...form, departmentId: form.departmentId || null, managerId: form.managerId || null });
      if (!res.ok) return void toast.error(res.error);
      setCreated({ ...res.data!, name: `${form.firstName} ${form.lastName}`.trim() });
      toast.success("Account created");
    });
  };

  const reset = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setCreated(null);
      setForm({ firstName: "", lastName: "", email: "", role: "INTERN", title: "", departmentId: "", managerId: "", employeeCode: "" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add member
        </Button>
      </DialogTrigger>
      {created ? (
        <DialogContent title={`${created.name} can sign in now`} description="Send them these details privately.">
          <CredentialReveal loginId={created.employeeCode} email={created.email} password={created.temporaryPassword} />
          <DialogFooter>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      ) : (
        <DialogContent
          title="Add a team member"
          description="Most people arrive automatically from the HR console. Use this for anyone who doesn't."
          size="lg"
        >
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input value={form.firstName} onChange={set("firstName")} required autoFocus />
            </Field>
            <Field label="Last name">
              <Input value={form.lastName} onChange={set("lastName")} />
            </Field>
            <Field label="Work email" className="sm:col-span-2">
              <Input type="email" value={form.email} onChange={set("email")} placeholder="name@focusrealm.com" required />
            </Field>
            <Field label="Role">
              <NativeSelect value={form.role} onChange={set("role")}>
                {canAddFounder && <option value="FOUNDER">Founder</option>}
                <option value="MANAGER">Management</option>
                <option value="EMPLOYEE">Employee</option>
                <option value="INTERN">Intern</option>
              </NativeSelect>
            </Field>
            <Field label="Title" optional>
              <Input value={form.title} onChange={set("title")} placeholder="e.g. Marketing Intern" />
            </Field>
            <Field label="Department" optional>
              <NativeSelect value={form.departmentId} onChange={set("departmentId")}>
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Reports to" optional>
              <NativeSelect value={form.managerId} onChange={set("managerId")}>
                <option value="">No one yet</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.title ? ` — ${m.title}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Employee ID" optional hint="Leave blank to assign the next FR-number automatically." className="sm:col-span-2">
              <Input value={form.employeeCode} onChange={set("employeeCode")} placeholder="Auto" className="font-mono" />
            </Field>
            <DialogFooter className="sm:col-span-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending}>
                Create account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
