import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { isPrismaMissingTable } from "@/lib/prisma-missing-table";

export const dynamic = "force-dynamic";

const readSchema = z
  .object({
    ids: z.array(z.string().min(1).max(200)).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((body) => body.all === true || (body.ids?.length ?? 0) > 0, {
    message: "ids or all required",
  });

/**
 * POST /api/notifications/read — mark persisted inbox rows read.
 *
 * Body: `{ ids: string[] }` for specific rows, or `{ all: true }` for every
 * unread row of the caller in the active workspace. `InAppNotification.isRead`
 * was written false on creation and never true, so the inbox only ever shrank
 * through dismissals. Scoped to the caller: a foreign id is simply not matched.
 */
export async function POST(req: NextRequest) {
  return withTenant("session", async ({ workspace, userId }) => {
    const body = await req.json().catch(() => ({}));
    const parsed = readSchema.safeParse(body);
    if (!parsed.success) throw new ApiError("ids or all required", 400);

    try {
      const result = await db.inAppNotification.updateMany({
        where: {
          workspaceId: workspace.id,
          userId,
          isRead: false,
          ...(parsed.data.all ? {} : { id: { in: parsed.data.ids ?? [] } }),
        },
        data: { isRead: true },
      });
      return jsonOk({ ok: true, count: result.count });
    } catch (err) {
      if (isPrismaMissingTable(err)) return jsonOk({ ok: true, count: 0 });
      throw err;
    }
  }, "notifications/read");
}
