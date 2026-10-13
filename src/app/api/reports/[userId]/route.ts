import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { isFounder } from "@/lib/permissions";
import { getTimeZone } from "@/lib/tz.server";
import { buildWorkReport, type WorkReportData } from "@/lib/work-report";
import { workReportPdf } from "@/lib/work-report-pdf";

export const dynamic = "force-dynamic";

/** Downloads a work report as a PDF — the live one, or a filed copy with ?saved=<id>. Founders only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isFounder(user)) return NextResponse.json({ error: "Work reports are for founders only." }, { status: 403 });
  const { userId } = await params;

  const savedId = request.nextUrl.searchParams.get("saved");
  let data: WorkReportData | null;
  let title = "Work report";
  if (savedId) {
    const saved = await db.workReport.findFirst({ where: { id: savedId, userId }, select: { data: true, reason: true } });
    data = (saved?.data as WorkReportData | undefined) ?? null;
    title = saved?.reason === "LAST_DAY" ? "Final work report" : saved?.reason === "OFFBOARDED" ? "Final work report" : "Work report";
  } else {
    data = await buildWorkReport(userId);
  }
  if (!data) return NextResponse.json({ error: "No such report." }, { status: 404 });

  const pdf = await workReportPdf(data, { tz: await getTimeZone(), title });
  const day = data.generatedAt.slice(0, 10);
  const name = `${data.person.employeeCode}-${data.person.name}`.replace(/[^A-Za-z0-9-]+/g, "-");
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}-work-report-${day}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
