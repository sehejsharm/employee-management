"use client";

import * as React from "react";
import Link from "next/link";
import { Award, Brain, Crown, Handshake, HeartHandshake, Lightbulb, Rocket, Sparkles, Star, Trash2, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { deleteRecognition, giveRecognition, toggleCheer } from "@/actions/recognition";
import { AWARD_SUGGESTIONS, BADGES, BADGE_KEYS, type BadgeKey } from "@/lib/recognition";
import { cn } from "@/lib/utils";

export const BADGE_ICON: Record<BadgeKey, React.ElementType> = {
  star: Star,
  above: Rocket,
  teamwork: Handshake,
  problem: Brain,
  ownership: HeartHandshake,
  learner: Zap,
  creative: Lightbulb,
  leadership: Crown,
};

export interface RecognisablePerson {
  id: string;
  name: string;
  title: string | null;
}

/** Recognise a colleague: kudos from anyone, or (founders and management) a named award. */
export function GiveRecognitionDialog({
  people,
  canAward,
  initialRecipientId,
  trigger,
}: {
  people: RecognisablePerson[];
  canAward: boolean;
  initialRecipientId?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [recipientId, setRecipientId] = React.useState(initialRecipientId ?? "");
  const [kind, setKind] = React.useState<"KUDOS" | "AWARD">("KUDOS");
  const [badge, setBadge] = React.useState<BadgeKey>("star");
  const [title, setTitle] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [pending, start] = React.useTransition();

  const send = () =>
    start(async () => {
      const res = await giveRecognition({ recipientId, kind, badge, title, message });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      setMessage("");
      setTitle("");
      if (!initialRecipientId) setRecipientId("");
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Award /> Recognise someone
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="lg" title="Recognise a colleague" description="It goes on the company-wide recognition wall. Be specific — say what they did and why it mattered.">
        <div className="space-y-4">
          {canAward && (
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["KUDOS", "Kudos", "Praise, seen by everyone"],
                  ["AWARD", "Award", "Announced to the whole company"],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition",
                    kind === value ? "border-brand/40 bg-brand-soft/60 ring-2 ring-brand/15" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                    {value === "AWARD" ? <Trophy className="size-4 text-warning" /> : <Sparkles className="size-4 text-brand" />} {label}
                  </span>
                  <span className="text-[12px] text-fg-muted">{hint}</span>
                </button>
              ))}
            </div>
          )}
          <Field label="Who">
            <NativeSelect value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
              <option value="">Pick a colleague…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.title ? ` — ${p.title}` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {kind === "AWARD" && (
            <Field label="Award">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Intern of the Month" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {AWARD_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTitle(s)}
                    className="rounded-full border border-line px-2.5 py-1 text-xs text-fg-muted transition hover:border-warning/50 hover:text-warning"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Badge">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BADGE_KEYS.map((key) => {
                const Icon = BADGE_ICON[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBadge(key)}
                    aria-pressed={badge === key}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition",
                      badge === key ? "border-warning/50 bg-warning-soft text-warning ring-2 ring-warning/15" : "border-line text-fg-muted hover:border-line-strong",
                    )}
                  >
                    <Icon className="size-5" />
                    <span className="text-[12px] font-medium leading-tight">{BADGES[key].label}</span>
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="What they did">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="e.g. Turned the competitor teardown around in a day and found the pricing gap we're now using in the board deck."
            />
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={send} loading={pending} disabled={!recipientId || message.trim().length < 10 || (kind === "AWARD" && title.trim().length < 3)}>
            {kind === "AWARD" ? <Trophy /> : <Sparkles />} {kind === "AWARD" ? "Give award" : "Send kudos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ClientRecognition {
  id: string;
  kind: "KUDOS" | "AWARD";
  badge: string;
  title: string | null;
  message: string;
  createdAt: string;
  ago: string;
  recipient: { id: string; firstName: string; lastName: string; avatarHue: number; title: string | null };
  giver: { id: string; firstName: string; lastName: string; avatarHue: number };
  cheers: number;
  cheered: boolean;
  canDelete: boolean;
}

function CheerButton({ r }: { r: ClientRecognition }) {
  const [state, setState] = React.useState({ cheered: r.cheered, count: r.cheers });
  const [pending, start] = React.useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !state.cheered;
          setState((s) => ({ cheered: next, count: s.count + (next ? 1 : -1) }));
          const res = await toggleCheer(r.id);
          if (!res.ok) {
            toast.error(res.error);
            setState({ cheered: r.cheered, count: r.cheers });
          }
        })
      }
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition",
        state.cheered ? "border-warning/40 bg-warning-soft text-warning" : "border-line text-fg-muted hover:border-warning/40 hover:text-warning",
      )}
      aria-pressed={state.cheered}
    >
      <span aria-hidden>👏</span> {state.cheered ? "Cheered" : "Cheer"}
      {state.count > 0 && <span className="tabular">· {state.count}</span>}
    </button>
  );
}

/** One recognition on the wall. Awards get the trophy treatment. */
export function RecognitionCard({ r, compact }: { r: ClientRecognition; compact?: boolean }) {
  const Icon = BADGE_ICON[r.badge as BadgeKey] ?? Award;
  const award = r.kind === "AWARD";
  const [pending, start] = React.useTransition();
  return (
    <article
      id={`r-${r.id}`}
      className={cn(
        "relative scroll-mt-24 overflow-hidden rounded-2xl border p-4 shadow-sm sm:p-5",
        award ? "border-warning/30 bg-gradient-to-br from-warning-soft via-surface to-surface" : "border-line bg-surface",
      )}
    >
      {award && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-warning/40 via-warning to-warning/40" />}
      <div className="flex items-start gap-3.5">
        <div className="relative shrink-0">
          <Avatar person={r.recipient} size={compact ? "md" : "lg"} />
          <span
            className={cn(
              "absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-surface",
              award ? "bg-warning text-white" : "bg-warning-soft text-warning",
            )}
          >
            {award ? <Trophy className="size-3.5" /> : <Icon className="size-3.5" />}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          {award && <div className="text-[11px] font-semibold uppercase tracking-wider text-warning">{r.title}</div>}
          <h3 className="text-[15px] font-semibold leading-snug">
            <Link href={`/people/${r.recipient.id}`} className="hover:text-brand">
              {r.recipient.firstName} {r.recipient.lastName}
            </Link>
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 align-middle text-[11px] font-semibold text-fg-muted ring-1 ring-line">
              <Icon className="size-3" /> {BADGES[r.badge as BadgeKey]?.label ?? "Recognition"}
            </span>
          </h3>
          {r.recipient.title && <div className="text-[12px] text-fg-subtle">{r.recipient.title}</div>}
          <p className={cn("mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg", compact && "line-clamp-3")}>{r.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
            <CheerButton r={r} />
            <span className="inline-flex items-center gap-1.5">
              <Avatar person={r.giver} size="xs" /> from {r.giver.firstName} {r.giver.lastName} · <span suppressHydrationWarning>{r.ago}</span>
            </span>
            {r.canDelete && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm("Remove this recognition from the wall?")) return;
                  start(async () => {
                    const res = await deleteRecognition(r.id);
                    if (!res.ok) toast.error(res.error);
                  });
                }}
                className="ml-auto rounded-md p-1 text-fg-subtle transition hover:bg-danger-soft hover:text-danger"
                aria-label="Remove"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
