"use client";

import Link from "next/link";
import { ArrowRight, Video } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useNow } from "@/lib/hooks";
import { formatDue, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface DashboardMeeting {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  meetUrl: string | null;
  organizer: string;
  people: { id: string; firstName: string; lastName: string; avatarHue: number }[];
}

/** Home: meetings you're in over the next week, with a Join button that lights up as they start. */
export function UpcomingMeetings({ meetings, tz }: { meetings: DashboardMeeting[]; tz: string }) {
  const now = useNow(30_000)?.getTime();
  if (meetings.length === 0) return null;
  return (
    <Card>
      <CardHeader
        icon={<Video />}
        title="Your meetings"
        description="The next seven days. Join opens 10 minutes before each starts."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/calendar">
              Calendar <ArrowRight />
            </Link>
          </Button>
        }
      />
      <CardBody className="pt-3">
        <ul className="divide-y divide-line">
          {meetings.map((m) => {
            const start = new Date(m.startAt).getTime();
            const live = !!now && start - 10 * 60_000 <= now && new Date(m.endAt).getTime() >= now;
            return (
              <li key={m.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {live && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-success" aria-label="Starting now" />}
                    <span className="truncate text-[14px] font-medium">{m.title}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-fg-muted">
                    <span suppressHydrationWarning>
                      {formatDue(new Date(m.startAt), tz)}–{formatTime(new Date(m.endAt), tz)}
                    </span>
                    <span>·</span>
                    <AvatarStack people={m.people} max={4} size="xs" />
                    <span className="truncate">by {m.organizer}</span>
                  </div>
                </div>
                {m.meetUrl && (
                  <Button asChild size="sm" variant={live ? "primary" : "soft"} className={cn("shrink-0", live && "shadow-brand")}>
                    <a href={m.meetUrl} target="_blank" rel="noopener noreferrer">
                      <Video /> {live ? "Join now" : "Join link"}
                    </a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
