import { db } from "@/lib/db";

export async function audit(entry: {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        summary: entry.summary,
        meta: (entry.meta ?? undefined) as never,
      },
    });
  } catch (error) {
    // The audit trail must never block the change it describes.
    console.error("audit log write failed", error);
  }
}
