import { Fragment } from "react";
import { cn } from "@/lib/utils";

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

/**
 * Plain text with line breaks kept and bare links made clickable. No HTML is
 * ever interpreted, so nothing typed into a task can inject markup.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <div className={cn("whitespace-pre-wrap break-words text-[14px] leading-relaxed text-fg", className)}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
          >
            {part.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}
            {part.replace(/^https?:\/\/(www\.)?/, "").length > 60 ? "…" : ""}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </div>
  );
}
