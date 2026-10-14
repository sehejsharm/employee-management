import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";

const bodySchema = z.object({ answer: z.enum(["joined", "declined"]) });

/**
 * Someone answered or turned down a "Meet now" call — in the Workspace or from
 * the notification on their phone. Recording it stops the call ringing on
 * their other devices.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say whether you joined or declined." }, { status: 400 });

  const { id } = await params;
  await db.meetingAttendee.updateMany({
    where: { meetingId: id, userId: user.id, callAnswer: null, meeting: { instant: true } },
    data: { callAnswer: parsed.data.answer === "joined" ? "JOINED" : "DECLINED", answeredAt: new Date() },
  });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
