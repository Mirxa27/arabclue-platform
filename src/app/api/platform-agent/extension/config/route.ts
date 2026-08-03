import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTenantContext } from "@/lib/workspace-context";
import {
  EXTENSION_CATEGORY_CATALOG,
  EXTENSION_DEFAULT_PORTALS,
  buildExtensionMatchDefaults,
} from "@/lib/extension-config";

export const dynamic = "force-dynamic";

/**
 * GET /api/platform-agent/extension/config
 * Remote config + auth probe for the Chrome extension.
 * Categories/portals/match defaults come from shared catalog + live brand profile
 * when the user is signed in (no client hardcoding required).
 */
export async function GET() {
  const session = await getSession().catch(() => null);
  const user = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? undefined,
        email: session.user.email ?? undefined,
        locale: session.user.locale === "en" ? "en" : "ar",
      }
    : undefined;

  let matchCriteriaDefaults = buildExtensionMatchDefaults();
  let sectors: string[] = [];
  let capabilities: string[] = [];

  if (session?.user?.id) {
    try {
      const tenant = await getTenantContext(session.user.id);
      const [workspace, pastProjects] = await Promise.all([
        db.workspace.findUnique({
          where: { id: tenant.workspace.id },
          select: {
            targetSectors: { select: { sector: true, notes: true } },
          },
        }),
        db.pastProject.findMany({
          where: {
            workspaceId: tenant.workspace.id,
            approved: true,
            revokedAt: null,
          },
          select: { sector: true, tags: true, title: true, titleAr: true },
          take: 40,
        }),
      ]);
      sectors = (workspace?.targetSectors ?? [])
        .flatMap((s) => [s.sector, s.notes])
        .filter((v): v is string => Boolean(v?.trim()));
      const tagBits = pastProjects.flatMap((p) =>
        [
          p.sector,
          ...(p.tags ? p.tags.split(",").map((t) => t.trim()) : []),
        ].filter((v): v is string => Boolean(v))
      );
      capabilities = [...new Set(tagBits)].slice(0, 40);
      matchCriteriaDefaults = buildExtensionMatchDefaults({
        sectors,
        capabilities,
        keywords: capabilities.filter((c) => /^[A-Za-z0-9 ._-]+$/.test(c)),
        keywordsAr: [
          ...sectors,
          ...pastProjects.map((p) => p.titleAr).filter(Boolean),
        ].filter((v): v is string => Boolean(v)),
      });
    } catch {
      /* keep catalog defaults */
    }
  }

  return NextResponse.json({
    ok: true,
    authenticated: Boolean(user),
    user,
    portals: EXTENSION_DEFAULT_PORTALS,
    categories: EXTENSION_CATEGORY_CATALOG,
    featureFlags: {
      universalCapture: true,
      copilot: true,
      autoScan: true,
      documentUpload: true,
      autopilot: true,
    },
    branding: {
      name: "ArabClue Agent",
      taglineEn:
        "Etimad intelligence · universal capture · Mission Control copilot",
      taglineAr: "ذكاء اعتماد · التقاط عالمي · مساعد Mission Control",
    },
    matchCriteriaDefaults,
    workspaceHints: {
      sectors,
      capabilities,
    },
  });
}
