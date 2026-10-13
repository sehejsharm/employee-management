"use client";

import * as React from "react";
import { PhoneOff, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface IncomingCall {
  id: string;
  meetUrl: string;
  ringUntil: string;
  organizer: { id: string; firstName: string; lastName: string; avatarHue: number; title: string | null };
}

const POLL_MS = 5_000;
const DISMISSED_KEY = "fr-dismissed-calls";

function dismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || "[]");
  } catch {
    return [];
  }
}

function dismiss(id: string) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed(), id].slice(-20)));
  } catch {}
}

/**
 * A phone-style ring made with the Web Audio API (no audio file to load):
 * two short dual-tone bursts, then a pause, repeated until stopped.
 */
function startRingtone(): () => void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  void ctx.resume().catch(() => {});
  let stopped = false;
  const burst = (at: number) => {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
    gain.gain.setValueAtTime(0.18, at + 0.38);
    gain.gain.linearRampToValueAtTime(0, at + 0.4);
    gain.connect(ctx.destination);
    for (const f of [440, 480]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + 0.4);
    }
  };
  const ring = () => {
    if (stopped) return;
    const t = ctx.currentTime + 0.05;
    burst(t);
    burst(t + 0.6);
  };
  ring();
  const id = window.setInterval(ring, 3000);
  return () => {
    stopped = true;
    window.clearInterval(id);
    void ctx.close().catch(() => {});
  };
}

/** Rings when someone starts a "Meet now" call with you, on any page of the Workspace. */
export function IncomingCallWatcher() {
  const [call, setCall] = React.useState<IncomingCall | null>(null);

  React.useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const res = await fetch("/api/calls/incoming", { cache: "no-store" });
        if (!res.ok || !live) return;
        const { calls } = (await res.json()) as { calls: IncomingCall[] };
        const skip = dismissed();
        const next = calls.find((c) => !skip.includes(c.id) && new Date(c.ringUntil).getTime() > Date.now()) ?? null;
        setCall((cur) => (cur?.id === next?.id ? cur : next));
      } catch {}
    };
    const first = window.setTimeout(check, 0);
    const id = window.setInterval(check, POLL_MS);
    return () => {
      live = false;
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  // Ring, flash the tab title, and raise a system notification while the call is waiting.
  React.useEffect(() => {
    if (!call) return;
    const stopRing = startRingtone();
    const title = document.title;
    const caller = call.organizer.firstName;
    let flip = false;
    const flash = window.setInterval(() => {
      flip = !flip;
      document.title = flip ? `📞 ${caller} is calling…` : title;
    }, 1000);
    let sys: Notification | null = null;
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      try {
        sys = new Notification(`${caller} is inviting you to a call right now`, { body: "Click to join on Google Meet.", icon: "/icon.svg", tag: call.id, requireInteraction: true });
        sys.onclick = () => {
          window.focus();
          window.open(call.meetUrl, "_blank", "noopener");
          dismiss(call.id);
          setCall(null);
        };
      } catch {}
    }
    const timeout = window.setTimeout(() => setCall(null), Math.max(0, new Date(call.ringUntil).getTime() - Date.now()));
    return () => {
      stopRing();
      window.clearInterval(flash);
      window.clearTimeout(timeout);
      document.title = title;
      sys?.close();
    };
  }, [call]);

  if (!call) return null;
  const close = () => {
    dismiss(call.id);
    setCall(null);
  };

  return (
    <div role="alertdialog" aria-live="assertive" aria-label={`${call.organizer.firstName} is calling`} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 text-center shadow-2xl">
        <div className="relative mx-auto w-fit">
          <span className="absolute inset-0 animate-ping rounded-full bg-success/30" />
          <Avatar person={call.organizer} size="xl" />
        </div>
        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-success">Incoming call</p>
        <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.015em]">
          {call.organizer.firstName} {call.organizer.lastName} is inviting you to a call right now
        </h2>
        {call.organizer.title && <p className="mt-0.5 text-[13px] text-fg-muted">{call.organizer.title}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={close}>
            <PhoneOff /> Not now
          </Button>
          <Button asChild size="lg" className="bg-success hover:bg-success/90">
            <a href={call.meetUrl} target="_blank" rel="noopener noreferrer" onClick={close}>
              <Video /> Join
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
