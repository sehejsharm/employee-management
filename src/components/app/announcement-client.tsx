"use client";

import * as React from "react";
import { MoreHorizontal, Pin, PinOff, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";
import { Switch } from "@/components/ui/switch";
import { deleteAnnouncement, postAnnouncement, togglePin } from "@/actions/announcements";

export function NewAnnouncement() {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [pinned, setPinned] = React.useState(false);
  const [pending, start] = React.useTransition();

  const submit = () =>
    start(async () => {
      const res = await postAnnouncement({ title, body, pinned });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      setTitle("");
      setBody("");
      setPinned(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send /> New announcement
        </Button>
      </DialogTrigger>
      <DialogContent title="Announce to the company" description="Everyone gets a notification." size="lg">
        <div className="space-y-4">
          <Field label="Headline">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office closed on Monday" autoFocus />
          </Field>
          <Field label="Message">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-40" placeholder="Share the details…" />
          </Field>
          <label className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
            <span>
              <span className="block text-[13.5px] font-medium">Pin to the top</span>
              <span className="block text-xs text-fg-subtle">Pinned announcements show on everyone&apos;s home screen.</span>
            </span>
            <Switch checked={pinned} onCheckedChange={setPinned} />
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} loading={pending}>
            Post announcement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AnnouncementMenu({ id, pinned }: { id: string; pinned: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Announcement actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onSelect={async () => {
            const res = await togglePin(id);
            if (res.ok) toast.success(res.message);
            else toast.error(res.error);
          }}
        >
          {pinned ? <PinOff /> : <Pin />} {pinned ? "Unpin" : "Pin to top"}
        </DropdownMenuItem>
        <DropdownMenuItem
          tone="danger"
          onSelect={async () => {
            if (!window.confirm("Delete this announcement?")) return;
            const res = await deleteAnnouncement(id);
            if (res.ok) toast.success(res.message);
            else toast.error(res.error);
          }}
        >
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
