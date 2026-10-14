import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { WorkReportData } from "@/lib/work-report-summary";

/**
 * Renders a work report as an A4 PDF: header with the Focus Realm mark, the
 * person, headline numbers, highlights, every task, and review feedback.
 * Standard PDF fonts only, so it runs anywhere (including Vercel functions).
 */

const A4 = { w: 595.28, h: 841.89 };
const M = 46;
const INK = rgb(0.07, 0.11, 0.2);
const MUTED = rgb(0.39, 0.45, 0.55);
const LINE = rgb(0.88, 0.91, 0.95);
const BRAND = rgb(0.1, 0.33, 0.78);
const SKY = rgb(0.37, 0.67, 0.93);
const SOFT = rgb(0.94, 0.96, 1);
const GOOD = rgb(0.06, 0.55, 0.33);
const BAD = rgb(0.8, 0.18, 0.2);

const STATUS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", BLOCKED: "Blocked", DONE: "Done" };

export async function workReportPdf(data: WorkReportData, opts: { tz: string; title?: string }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${data.person.name} — work report`);
  doc.setAuthor("Focus Realm Workspace");
  doc.setCreationDate(new Date(data.generatedAt));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const date = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("en-GB", { timeZone: opts.tz, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—";

  // Helvetica only speaks WinAnsi: swap anything else for a close ASCII cousin.
  const clean = (text: string) =>
    text
      // Line breaks and tabs become spaces (the PDF draws each field on one wrapped line).
      .replace(/\s+/g, " ")
      .replace(/₹/g, "Rs.")
      .replace(/[↔→]/g, "-")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[^\x20-\x7E -ÿ–—•…]/g, "?");

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;

  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 24) newPage();
  };
  const width = (t: string, f: PDFFont, s: number) => f.widthOfTextAtSize(clean(t), s);
  const wrap = (text: string, f: PDFFont, size: number, max: number) => {
    const lines: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) <= max) line = next;
        else {
          if (line) lines.push(line);
          // A single word wider than the column is cut to fit.
          let w = word;
          while (f.widthOfTextAtSize(w, size) > max && w.length > 1) w = w.slice(0, -1);
          line = w;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const text = (t: string, x: number, size: number, f = regular, color = INK) => page.drawText(clean(t), { x, y, size, font: f, color });
  const truncate = (t: string, f: PDFFont, size: number, max: number) => {
    let s = clean(t);
    if (f.widthOfTextAtSize(s, size) <= max) return s;
    while (s.length > 1 && f.widthOfTextAtSize(`${s}…`, size) > max) s = s.slice(0, -1);
    return `${s}…`;
  };
  const paragraph = (t: string, size = 10, f = regular, color = INK, indent = 0) => {
    for (const line of wrap(t, f, size, A4.w - 2 * M - indent)) {
      ensure(size + 4);
      text(line, M + indent, size, f, color);
      y -= size + 4;
    }
  };
  const heading = (t: string) => {
    ensure(40);
    y -= 10;
    text(t.toUpperCase(), M, 9, bold, BRAND);
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.6, color: LINE });
    y -= 14;
  };

  /* Header: the mark, the title, when it was made. */
  const mark = (x: number, top: number, s: number) => {
    const p = (d: string, color: ReturnType<typeof rgb>) => page.drawSvgPath(d, { x, y: top, scale: s, color });
    p("M3.4 2.4 H5.8 V29.8 H3.4 Z M3.4 2.4 H19.1 V3.5 H3.4 Z M15.4 3.5 H19.1 V6.2 Z M5.8 15.4 H14.4 V16.7 H5.8 Z", BRAND);
    p("M6.6 12.4 H8.5 V29.8 H6.6 Z", SKY);
    page.drawSvgPath("M8.5 12.85 H13.4 C17.5 12.85 19.6 14.7 19.6 16.7 C19.6 18.7 17.5 20.5 13.4 20.5 H8.5 M13.1 20.5 L20.2 29.8", {
      x,
      y: top,
      scale: s,
      borderColor: SKY,
      borderWidth: 0.95,
    });
  };
  // The mark is 32 units tall and drawn downwards from `top`: at 0.95 it's ~30pt.
  mark(M - 3, y + 8, 0.95);
  text("Focus Realm Workspace", M + 26, 9, bold, BRAND);
  const stamp = `Generated ${date(data.generatedAt)}`;
  page.drawText(stamp, { x: A4.w - M - width(stamp, regular, 8), y, size: 8, font: regular, color: MUTED });
  y -= 12;
  text("Confidential — founders only", M + 26, 8, regular, MUTED);
  y -= 40;

  text(opts.title ?? "Work report", M, 22, bold);
  y -= 22;
  text(data.person.name, M, 14, bold, BRAND);
  y -= 16;
  paragraph(
    [data.person.title ?? data.person.role, data.person.department, data.person.employeeCode].filter(Boolean).join("  ·  "),
    10,
    regular,
    MUTED,
  );

  /* Who and when. */
  const facts: [string, string][] = [
    ["Period", `${date(data.period.from)} – ${date(data.period.to)} (${data.stats.days} days)`],
    ["Reports to", data.person.reportsTo.join(", ") || "—"],
    ["Email", data.person.email],
    ["Last day", data.person.lastDay ? date(data.person.lastDay) : data.person.status === "INACTIVE" ? "Left" : "Still working"],
  ];
  y -= 6;
  for (const [k, v] of facts) {
    ensure(14);
    text(k, M, 9, bold, MUTED);
    text(truncate(v, regular, 10, A4.w - 2 * M - 80), M + 80, 10);
    y -= 14;
  }

  /* Headline numbers as tiles. */
  y -= 8;
  const tiles: [string, string][] = [
    ["Tasks done", `${data.stats.completed}/${data.stats.total}`],
    ["On time", data.stats.onTimeRate === null ? "—" : `${data.stats.onTimeRate}%`],
    ["Accepted first time", data.stats.firstTimeAcceptance === null ? "—" : `${data.stats.firstTimeAcceptance}%`],
    ["Overdue now", String(data.stats.overdue)],
  ];
  const gap = 8;
  const tw = (A4.w - 2 * M - gap * (tiles.length - 1)) / tiles.length;
  ensure(58);
  tiles.forEach(([label, value], i) => {
    const x = M + i * (tw + gap);
    page.drawRectangle({ x, y: y - 46, width: tw, height: 50, color: SOFT, borderColor: LINE, borderWidth: 0.6 });
    page.drawText(clean(value), { x: x + 10, y: y - 22, size: 17, font: bold, color: label === "Overdue now" && data.stats.overdue ? BAD : INK });
    page.drawText(clean(label), { x: x + 10, y: y - 38, size: 8, font: regular, color: MUTED });
  });
  y -= 62;

  heading("Highlights");
  for (const h of data.highlights) {
    ensure(14);
    text("•", M, 10, bold, BRAND);
    const lines = wrap(h, regular, 10, A4.w - 2 * M - 14);
    lines.forEach((line, i) => {
      if (i) ensure(14);
      text(line, M + 12, 10);
      y -= 14;
    });
  }

  /* Every task. */
  heading(`Tasks · ${data.tasks.length}`);
  const cols = [
    { label: "Task", w: 0.44 },
    { label: "Role", w: 0.1 },
    { label: "Status", w: 0.13 },
    { label: "Due", w: 0.13 },
    { label: "Delivered", w: 0.2 },
  ];
  const tableW = A4.w - 2 * M;
  const header = () => {
    let x = M;
    for (const c of cols) {
      text(c.label, x, 8, bold, MUTED);
      x += c.w * tableW;
    }
    y -= 12;
  };
  if (data.tasks.length === 0) paragraph("No tasks in this period.", 10, regular, MUTED);
  else header();
  for (const t of data.tasks) {
    if (y - 30 < M + 24) {
      newPage();
      header();
    }
    let x = M;
    const delivered = t.deliveredAt ? `${date(t.deliveredAt)}${t.onTime === true ? " · on time" : t.onTime === false ? " · late" : ""}` : t.onTime === false ? "Overdue" : "—";
    const cells = [`${t.ref}  ${t.title}`, t.role === "LEAD" ? "Lead" : "Follower", STATUS[t.status] ?? t.status, date(t.dueAt), delivered];
    cells.forEach((c, i) => {
      const w = cols[i].w * tableW - 8;
      const color = i === 4 ? (t.onTime === true ? GOOD : t.onTime === false ? BAD : MUTED) : i === 0 ? INK : MUTED;
      text(truncate(c, i === 0 ? bold : regular, 9, w), x, 9, i === 0 ? bold : regular, color);
      x += cols[i].w * tableW;
    });
    y -= 11;
    text(truncate(`Assigned by ${t.assignedBy} on ${date(t.assignedAt)}`, regular, 7.5, cols[0].w * tableW - 8), M, 7.5, regular, MUTED);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.4, color: LINE });
    y -= 11;
  }

  /* What reviewers said. */
  const notes = data.submissions.filter((s) => s.reviewNote);
  if (notes.length) {
    heading("Review feedback");
    for (const s of notes.slice(0, 25)) {
      ensure(30);
      text(truncate(s.task, bold, 9.5, A4.w - 2 * M), M, 9.5, bold);
      y -= 13;
      paragraph(`${s.status === "ACCEPTED" ? "Accepted" : "Sent back"}${s.reviewedBy ? ` by ${s.reviewedBy}` : ""}${s.reviewedAt ? `, ${date(s.reviewedAt)}` : ""}: "${s.reviewNote}"`, 9, regular, MUTED);
      y -= 4;
    }
  }

  if (data.recognitions?.length) {
    heading(`Recognition · ${data.recognitions.length}`);
    for (const r of data.recognitions.slice(0, 20)) {
      ensure(30);
      text(truncate(`${r.kind === "AWARD" ? `Award: ${r.title}` : r.badge} — from ${r.from}, ${date(r.at)}`, bold, 9.5, A4.w - 2 * M), M, 9.5, bold, r.kind === "AWARD" ? rgb(0.72, 0.45, 0.02) : INK);
      y -= 13;
      paragraph(`"${r.message}"`, 9, regular, MUTED);
      y -= 4;
    }
  }

  heading("Engagement");
  paragraph(
    `${data.progressUpdates} progress update${data.progressUpdates === 1 ? "" : "s"} · ${data.comments} comment${data.comments === 1 ? "" : "s"} · ${data.updateRequests.answered}/${data.updateRequests.received} update requests answered · ${data.stats.submissions} submission${data.stats.submissions === 1 ? "" : "s"} (${data.stats.accepted} accepted, ${data.stats.sentBack} sent back) · ${data.meetings} meeting${data.meetings === 1 ? "" : "s"}`,
    9.5,
    regular,
    INK,
  );

  /* Footer on every page. */
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const footer = `${clean(data.person.name)} · ${data.person.employeeCode} · Focus Realm Workspace`;
    p.drawText(footer, { x: M, y: 26, size: 7.5, font: regular, color: MUTED });
    const n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: A4.w - M - regular.widthOfTextAtSize(n, 7.5), y: 26, size: 7.5, font: regular, color: MUTED });
  });

  return doc.save();
}
