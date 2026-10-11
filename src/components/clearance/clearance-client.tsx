"use client";

import * as React from "react";
import { Check, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  answerClearanceRequest,
  decideClearanceRequest,
  grantClearance,
  requestClearance,
  revokeClearance,
  withdrawClearanceRequest,
} from "@/actions/clearance";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import type { ActionResult } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface PickPerson {
  id: string;
  firstName: string;
  lastName: string;
  avatarHue: number;
  title: string | null;
}

/** Runs a server action with a busy state and a toast either way. */
function useAction() {
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<ActionResult>, after?: () => void) => {
    setBusy(key);
    try {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message ?? "Done.");
      after?.();
    } catch {
      toast.error("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export function RequestForm({ people }: { people: PickPerson[] }) {
  const [subjectId, setSubjectId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const { busy, run } = useAction();
  if (people.length === 0) return <p className="text-[13px] text-fg-subtle">You already have clearance for everyone you could ask about.</p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run("send", () => requestClearance({ subjectId, reason }), () => {
          setSubjectId("");
          setReason("");
        });
      }}
      className="space-y-4"
    >
      <Field label="Whose work do you need to see?" htmlFor="req-subject">
        <NativeSelect id="req-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
          <option value="">Choose a colleague…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.firstName} {p.lastName}
              {p.title ? ` — ${p.title}` : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Why?" htmlFor="req-reason" hint="It goes to them and to the founders. At least 10 characters.">
        <Textarea id="req-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. I'm taking over the vendor follow-ups." />
      </Field>
      <Button type="submit" loading={busy === "send"} disabled={!subjectId || reason.trim().length < 10}>
        Send request
      </Button>
    </form>
  );
}

export function AnswerButtons({ requestId }: { requestId: string }) {
  const { busy, run } = useAction();
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => run("yes", () => answerClearanceRequest(requestId, true))} loading={busy === "yes"}>
        <Check /> Allow
      </Button>
      <Button size="sm" variant="secondary" onClick={() => run("no", () => answerClearanceRequest(requestId, false))} loading={busy === "no"}>
        <X /> Decline
      </Button>
    </div>
  );
}

export function DecideButtons({ requestId }: { requestId: string }) {
  const { busy, run } = useAction();
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => run("yes", () => decideClearanceRequest(requestId, { approve: true }))} loading={busy === "yes"}>
        <ShieldCheck /> Approve
      </Button>
      <Button size="sm" variant="secondary" onClick={() => run("no", () => decideClearanceRequest(requestId, { approve: false }))} loading={busy === "no"}>
        Decline
      </Button>
    </div>
  );
}

export function WithdrawButton({ requestId }: { requestId: string }) {
  const { busy, run } = useAction();
  return (
    <Button size="xs" variant="ghost" onClick={() => run("w", () => withdrawClearanceRequest(requestId))} loading={busy === "w"}>
      Withdraw
    </Button>
  );
}

export function RevokeButton({ clearanceId, name }: { clearanceId: string; name: string }) {
  const { busy, run } = useAction();
  return (
    <Button
      size="xs"
      variant="ghost"
      className="text-danger hover:text-danger"
      onClick={() => {
        if (window.confirm(`End this clearance? ${name} will stop seeing that work straight away.`)) run("r", () => revokeClearance(clearanceId));
      }}
      loading={busy === "r"}
    >
      Revoke
    </Button>
  );
}

const DURATIONS = [
  { value: "0", label: "No end date" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

/** Founders: give one person clearance over several colleagues at once. */
export function GrantForm({ people }: { people: PickPerson[] }) {
  const [viewerId, setViewerId] = React.useState("");
  const [subjects, setSubjects] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");
  const [days, setDays] = React.useState<(typeof DURATIONS)[number]["value"]>("0");
  const [note, setNote] = React.useState("");
  const { busy, run } = useAction();

  const candidates = people.filter((p) => p.id !== viewerId);
  const q = query.trim().toLowerCase();
  const shown = q ? candidates.filter((p) => `${p.firstName} ${p.lastName} ${p.title ?? ""}`.toLowerCase().includes(q)) : candidates;
  const toggle = (id: string) => setSubjects((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run("grant", () => grantClearance({ viewerId, subjectIds: subjects.filter((id) => id !== viewerId), days: Number(days), note }), () => {
          setSubjects([]);
          setNote("");
        });
      }}
      className="space-y-4"
    >
      <Field label="Who gets clearance" htmlFor="grant-viewer">
        <NativeSelect id="grant-viewer" value={viewerId} onChange={(e) => setViewerId(e.target.value)} required>
          <option value="">Choose a person…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.firstName} {p.lastName}
              {p.title ? ` — ${p.title}` : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-medium">Whose work they can see</span>
          <span className="text-xs text-fg-subtle tabular">{subjects.length} chosen</span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" className="pl-9" />
        </div>
        <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1">
          {shown.map((p) => {
            const on = subjects.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition", on ? "bg-brand-soft" : "hover:bg-surface-hover")}
                >
                  <Avatar person={p} size="xs" />
                  <span className="min-w-0 flex-1 truncate">
                    {p.firstName} {p.lastName}
                    {p.title && <span className="text-fg-subtle"> · {p.title}</span>}
                  </span>
                  <span className={cn("flex h-4 w-4 items-center justify-center rounded border", on ? "border-brand bg-brand text-brand-fg" : "border-line-strong")}>
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-2 py-3 text-center text-[13px] text-fg-subtle">No one matches.</li>}
        </ul>
        <p className="mt-1.5 text-xs text-fg-subtle">Founders aren&apos;t listed: their work is visible only to founders.</p>
      </div>

      <div>
        <div className="mb-1.5 text-[13px] font-medium">For how long</div>
        <Segmented options={DURATIONS.map((d) => ({ value: d.value, label: d.label }))} value={days} onChange={setDays} layoutId="grant-duration" size="sm" />
      </div>

      <Field label="Note" htmlFor="grant-note" optional>
        <Input id="grant-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Covering for Riya while she's on leave" />
      </Field>

      <Button type="submit" loading={busy === "grant"} disabled={!viewerId || subjects.filter((id) => id !== viewerId).length === 0}>
        <ShieldCheck /> Give clearance
      </Button>
    </form>
  );
}
