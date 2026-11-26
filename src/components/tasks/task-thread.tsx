import Link from "next/link";
import { GitBranch, Plus } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DueLabel } from "@/components/tasks/badges";
import { STATUS_META } from "@/components/tasks/meta";
import type { ThreadStep } from "@/lib/tasks/thread";
import { cn, taskRef } from "@/lib/utils";

/**
 * The thread a task belongs to: each step in order (plan → execute → …), with
 * the one being viewed marked, and a way to add what comes next.
 */
export function TaskThread({ steps, currentId, tz, canExtend }: { steps: ThreadStep[]; currentId: string; tz: string; canExtend: boolean }) {
  const inThread = steps.length > 1;
  if (!inThread && !canExtend) return null;
  const done = steps.filter((s) => s.status === "DONE").length;
  const add = (
    <Button asChild variant={inThread ? "secondary" : "soft"} size="sm">
      <Link href={`/tasks/new?after=${currentId}`}>
        <Plus /> Add next step
      </Link>
    </Button>
  );

  if (!inThread) {
    return (
      <div id="thread" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line bg-surface/60 px-4 py-3">
        <p className="flex min-w-0 items-center gap-2.5 text-[13px] text-fg-muted">
          <GitBranch className="size-4 shrink-0 text-fg-subtle" />
          <span>Does more work follow this? Turn it into a thread — e.g. planning, then executing.</span>
        </p>
        {add}
      </div>
    );
  }

  return (
    <Card id="thread" className="scroll-mt-24">
      <CardHeader
        icon={<GitBranch />}
        title="Thread"
        description={`${steps.length} steps · ${done} done`}
        action={canExtend ? add : undefined}
      />
      <CardBody className="px-3 pt-1 sm:px-4">
        <ol>
          {steps.map((s, i) => {
            const meta = STATUS_META[s.status];
            const current = s.id === currentId;
            const row = (
              <>
                <span className="relative flex w-7 shrink-0 justify-center self-stretch">
                  {i < steps.length - 1 && <span className="absolute left-1/2 top-7 -bottom-3 w-px -translate-x-1/2 bg-line" aria-hidden />}
                  <span className={cn("relative z-[1] mt-0.5 flex size-7 items-center justify-center rounded-full bg-surface ring-1 ring-line", current && "ring-2 ring-brand")}>
                    <meta.icon className={cn("size-4", meta.iconClass)} aria-label={meta.label} />
                  </span>
                </span>
                <span className="min-w-0 flex-1 pb-3">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono text-[11.5px] text-fg-subtle">
                      Step {i + 1} · {taskRef(s.number)}
                    </span>
                    {current && <span className="rounded-full bg-brand-soft px-1.5 py-px text-[10.5px] font-semibold text-brand-soft-fg">You are here</span>}
                  </span>
                  <span className={cn("mt-0.5 block text-[14px] font-medium leading-snug wrap-anywhere", s.status === "DONE" && !current && "text-fg-muted")}>{s.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-subtle">
                    <span>{meta.label}</span>
                    <DueLabel dueAt={s.dueAt.toISOString()} status={s.status} tz={tz} />
                  </span>
                </span>
                <AvatarStack people={s.assignees.map((a) => a.user)} max={3} size="xs" />
              </>
            );
            return (
              <li key={s.id}>
                {current ? (
                  <div className="flex items-start gap-3 rounded-xl px-2 pt-2" aria-current="step">
                    {row}
                  </div>
                ) : (
                  <Link href={`/tasks/${s.id}`} className="flex items-start gap-3 rounded-xl px-2 pt-2 transition-colors hover:bg-surface-hover">
                    {row}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}
