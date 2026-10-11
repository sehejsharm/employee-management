import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClearedIds } from "@/lib/clearance";
import { taskVisibilityWhere } from "@/lib/tasks/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 1) return NextResponse.json({ tasks: [], people: [] });

  const numeric = Number(q.replace(/^t-?/i, ""));
  const cleared = await getClearedIds(user);

  const [tasks, people] = await Promise.all([
    db.task.findMany({
      where: {
        AND: [
          taskVisibilityWhere(user, cleared),
          { archivedAt: null },
          {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              ...(Number.isInteger(numeric) && numeric > 0 ? [{ number: numeric }] : []),
            ],
          },
        ],
      },
      orderBy: { dueAt: "asc" },
      take: 6,
      select: { id: true, number: true, title: true, status: true },
    }),
    db.user.findMany({
      where: {
        status: { not: "INACTIVE" },
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          { employeeCode: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 6,
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, title: true, avatarHue: true, employeeCode: true },
    }),
  ]);

  return NextResponse.json({ tasks, people }, { headers: { "Cache-Control": "no-store" } });
}
