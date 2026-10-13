"use client";

import * as React from "react";
import { FileText, MoreHorizontal, Paperclip, Pin, PinOff, Send, Trash2, X } from "lucide-react";
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
  const [pdf, setPdf] = React.useState<File | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pending, start] = React.useTransition();

  const submit = () =>
    start(async () => {
      const form = new FormData();
      form.set("title", title);
      form.set("body", body);
      form.set("pinned", String(pinned));
      if (pdf) form.set("pdf", pdf);
      const res = await postAnnouncement(form);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      setTitle("");
      setBody("");
      setPinned(false);
      setPdf(null);
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
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                setPdf(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {pdf ? (
              <div className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
                <FileText className="size-5 shrink-0 text-danger" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{pdf.name}</span>
                <Button variant="ghost" size="icon-sm" aria-label="Remove PDF" onClick={() => setPdf(null)}>
                  <X />
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <Paperclip /> Attach a PDF
              </Button>
            )}
          </div>
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

export function AnnouncementPdf({ id, name, size }: { id: string; name: string; size: string }) {
  const href = `/api/announcements/${id}/pdf`;
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface-sunken/50 px-4 py-3">
      <FileText className="size-6 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium">{name}</div>
        <div className="text-xs text-fg-subtle">PDF · {size}</div>
      </div>
      <Button variant="secondary" size="sm" asChild>
        <a href={href} target="_blank" rel="noopener">
          View
        </a>
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <a href={`${href}?download=1`} download={name}>
          Download
        </a>
      </Button>
    </div>
  );
}
