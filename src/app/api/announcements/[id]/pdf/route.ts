import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { signedDownloadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** The PDF shared with an announcement. Announcements are company-wide, so anyone signed in may read it. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const a = await db.announcement.findUnique({ where: { id }, select: { pdf: true, pdfKey: true, pdfName: true } });
  if (!a?.pdf && !a?.pdfKey) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const name = a.pdfName || "announcement.pdf";
  if (a.pdfKey) {
    const url = await signedDownloadUrl(a.pdfKey, { fileName: name, contentType: "application/pdf", inline: !download });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  }
  return new NextResponse(Buffer.from(a.pdf!), {
    headers: {
      "Content-Type": download ? "application/octet-stream" : "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
