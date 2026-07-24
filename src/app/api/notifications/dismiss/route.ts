import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

const dismissSchema = z.object({
  id: z.string().min(1).max(200).optional(),
  ids: z.array(z.string().min(1).max(200)).max(200).optional(),
});

/** GET /api/notifications/dismissals — list dismissed notification ids for user */
export async function GET() {
  return withTenant("session", async ({ userId }) => {
    const rows = await db.notificationDismissal.findMany({
      where: { userId },
      select: { notificationId: true, dismissedAt: true },
      orderBy: { dismissedAt: "desc" },
      take: 500,
    });
    return jsonOk({
      ids: rows.map((r) => r.notificationId),
      items: rows,
    });
  }, "notification-dismissals");
}

/** POST /api/notifications/dismiss — dismiss one or many notification ids */
export async function POST(req: NextRequest) {
  return withTenant("session", async ({ userId }) => {
    const body = await req.json().catch(() => ({}));
    const parsed = dismissSchema.safeParse(body);
    if (!parsed.success) throw new ApiError("Validation failed", 400);

    const ids = [
      ...new Set(
        [
          ...(parsed.data.id ? [parsed.data.id] : []),
          ...(parsed.data.ids ?? []),
        ].filter(Boolean)
      ),
    ];
    if (ids.length === 0) throw new ApiError("id or ids required", 400);

    await db.$transaction(
      ids.map((notificationId) =>
        db.notificationDismissal.upsert({
          where: {
            userId_notificationId: { userId, notificationId },
          },
          create: { userId, notificationId },
          update: { dismissedAt: new Date() },
        })
      )
    );

    return jsonOk({ ok: true, count: ids.length });
  }, "notification-dismiss");
}
