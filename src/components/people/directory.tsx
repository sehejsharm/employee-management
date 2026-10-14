"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Mail, MapPin, Search, Target, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { deptColor } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

export interface DirectoryPerson {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  role: string;
  roleLabel: string;
  status: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
  avatarHue: number;
  employeeCode: string;
  email: string;
  /** How many other current people use the same email. */
  sharedEmailWith: number;
  location: string | null;
  focus: string | null;
  department: { id: string; name: string; color: string } | null;
  manager: string | null;
}

export function Directory({ people, departments }: { people: DirectoryPerson[]; departments: { id: string; name: string; color: string }[] }) {
  const [query, setQuery] = React.useState("");
  const [role, setRole] = React.useState<"all" | "FOUNDER" | "MANAGER" | "EMPLOYEE" | "INTERN">("all");
  const [dept, setDept] = React.useState<string>("all");
  const [status, setStatus] = React.useState<"current" | "former">("current");

  const list = people.filter((p) => {
    if (status === "current" ? p.status === "INACTIVE" : p.status !== "INACTIVE") return false;
    if (role !== "all" && p.role !== role) return false;
    if (dept !== "all" && p.department?.id !== dept) return false;
    const q = query.trim().toLowerCase();
    if (q && !`${p.firstName} ${p.lastName} ${p.title ?? ""} ${p.employeeCode} ${p.email} ${p.department?.name ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, title, ID or email"
            className="h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-base shadow-xs sm:text-[13.5px] outline-none placeholder:text-fg-subtle focus:border-brand focus:ring-4 focus:ring-ring/40"
          />
        </div>
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <Segmented
            layoutId="dir-role"
            size="sm"
            value={role}
            onChange={setRole}
            options={[
              { value: "all", label: "Everyone" },
              { value: "FOUNDER", label: "Founders" },
              { value: "MANAGER", label: "Management" },
              { value: "EMPLOYEE", label: "Employees" },
              { value: "INTERN", label: "Interns" },
            ]}
          />
        </div>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="h-9 rounded-[10px] border border-line bg-surface px-3 text-base shadow-xs outline-none sm:text-[13px]"
        >
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Segmented
          layoutId="dir-status"
          size="sm"
          className="lg:ml-auto"
          value={status}
          onChange={setStatus}
          options={[
            { value: "current", label: "Current" },
            { value: "former", label: "Former" },
          ]}
        />
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Users />} title="No one matches" description="Try a different search or filter." />
      ) : (
        <motion.ul layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {list.map((p, i) => {
              const c = deptColor(p.department?.color);
              return (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, 16) * 0.02 }}
                >
                  <Link
                    href={`/people/${p.id}`}
                    className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
                  >
                    <div className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r opacity-0 transition group-hover:opacity-100", c.bar)} />
                    <div className="flex items-start gap-3">
                      <Avatar person={p} size="lg" dimmed={p.status === "INACTIVE"} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-semibold group-hover:text-brand">
                          {p.firstName} {p.lastName}
                        </div>
                        <div className="truncate text-[13px] text-fg-muted">{p.title ?? p.roleLabel}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="font-mono text-[11px] text-fg-subtle">{p.employeeCode}</span>
                          {p.status === "ON_LEAVE" && <span className="rounded-full bg-warning-soft px-1.5 text-[10.5px] font-semibold text-warning">On leave</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-muted">
                      <Mail className="size-3 shrink-0" />
                      <span className="truncate">{p.email}</span>
                      {p.sharedEmailWith > 0 && (
                        <span
                          className="shrink-0 rounded-full bg-info-soft px-1.5 text-[10.5px] font-semibold text-info"
                          title={`Shared with ${p.sharedEmailWith} other ${p.sharedEmailWith === 1 ? "person" : "people"}`}
                        >
                          Shared · {p.sharedEmailWith + 1}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-muted">
                      {p.department && (
                        <span className={cn("inline-flex items-center gap-1.5 font-medium", c.text)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                          {p.department.name}
                        </span>
                      )}
                      <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-fg-muted">{p.roleLabel}</span>
                      {p.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {p.location}
                        </span>
                      )}
                    </div>
                    {p.focus && p.status !== "INACTIVE" && (
                      <p className="mt-3 line-clamp-2 rounded-lg bg-surface-sunken/70 px-2.5 py-1.5 text-[12px] text-fg-muted">
                        <Target className="mr-1 inline size-3 text-brand" />
                        {p.focus}
                      </p>
                    )}
                    {p.manager && <p className="mt-auto pt-3 text-[11.5px] text-fg-subtle">Reports to {p.manager}</p>}
                  </Link>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}
