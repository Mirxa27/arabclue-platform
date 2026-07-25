import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getTenantContext } from "@/lib/workspace-context";
import type { TemplateMarketplaceItem } from "@/lib/proposal-builder-types";
import {
  filterSystemTemplateCatalog,
  isTemplateCategory,
} from "@/lib/template-marketplace-catalog";

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function parseSectionTypes(value: unknown): TemplateMarketplaceItem["sectionTypes"] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is TemplateMarketplaceItem["sectionTypes"][number] =>
      typeof item === "string",
  );
}

function localized(value: unknown): { ar: string; en: string } {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      ar: typeof record.ar === "string" ? record.ar : "",
      en: typeof record.en === "string" ? record.en : "",
    };
  }
  return { ar: "", en: "" };
}

async function loadDbTemplates(opts: {
  workspaceId: string;
  category: string | null;
  isFeatured: boolean;
  search: string | null;
  sortBy: string;
  page: number;
  pageSize: number;
}): Promise<{ templates: TemplateMarketplaceItem[]; total: number } | null> {
  try {
    const where: Record<string, unknown> = {
      AND: [
        {
          OR: [
            { workspaceId: opts.workspaceId },
            { isPublic: true },
            { workspaceId: null },
          ],
        },
      ],
    };

    if (opts.category) {
      (where.AND as object[]).push({ category: opts.category });
    }
    if (opts.isFeatured) {
      (where.AND as object[]).push({ isFeatured: true });
    }
    if (opts.search) {
      (where.AND as object[]).push({
        OR: [
          { nameJson: { path: ["en"], string_contains: opts.search } },
          { nameJson: { path: ["ar"], string_contains: opts.search } },
          { descriptionJson: { path: ["en"], string_contains: opts.search } },
          { descriptionJson: { path: ["ar"], string_contains: opts.search } },
        ],
      });
    }

    const orderBy =
      opts.sortBy === "rating"
        ? { rating: "desc" as const }
        : opts.sortBy === "downloads"
          ? { downloadCount: "desc" as const }
          : opts.sortBy === "name"
            ? { createdAt: "desc" as const }
            : { createdAt: "desc" as const };

    const [rows, total] = await Promise.all([
      db.templateMarketplaceEntry.findMany({
        where,
        orderBy,
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: {
          creator: { select: { id: true, name: true, avatarUrl: true } },
          workspace: { select: { id: true, name: true, nameAr: true } },
        },
      }),
      db.templateMarketplaceEntry.count({ where }),
    ]);

    return {
      total,
      templates: rows.map((t) => ({
        id: t.id,
        templateKey: t.templateKey,
        name: localized(t.nameJson),
        description: localized(t.descriptionJson),
        category: isTemplateCategory(t.category) ? t.category : "general",
        industry: t.industry,
        sectionTypes: parseSectionTypes(t.sectionTypes),
        previewData:
          t.previewJson && typeof t.previewJson === "object"
            ? (t.previewJson as Record<string, unknown>)
            : null,
        rating: t.rating,
        ratingCount: t.ratingCount,
        downloadCount: t.downloadCount,
        usageCount: t.usageCount,
        isPublic: t.isPublic,
        isFeatured: t.isFeatured,
        version: t.version,
        tags: parseTags(t.tags),
        createdBy: t.createdBy,
        createdAt: t.createdAt.toISOString(),
        source: t.workspaceId
          ? t.workspaceId === opts.workspaceId
            ? "workspace"
            : "public"
          : "system",
      })),
    };
  } catch (error) {
    console.warn("[template-marketplace] DB catalog unavailable — using system catalog", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categoryParam = searchParams.get("category");
  const category =
    categoryParam && isTemplateCategory(categoryParam) ? categoryParam : null;
  const sortBy = searchParams.get("sortBy") ?? "newest";
  const isFeatured = searchParams.get("isFeatured") === "true";
  const search = searchParams.get("search");
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number.parseInt(searchParams.get("pageSize") ?? "20", 10) || 20),
  );

  const workspaceId = (await getTenantContext(session.user.id)).workspace.id;

  const fromDb = await loadDbTemplates({
    workspaceId,
    category,
    isFeatured,
    search,
    sortBy,
    page,
    pageSize,
  });

  if (fromDb && fromDb.total > 0) {
    return NextResponse.json({
      ok: true,
      templates: fromDb.templates,
      total: fromDb.total,
      page,
      pageSize,
      source: "database",
    });
  }

  const catalog = filterSystemTemplateCatalog({
    category: category ?? undefined,
    isFeatured: isFeatured || undefined,
    search: search ?? undefined,
    sortBy: sortBy as "newest" | "rating" | "downloads" | "name",
  });
  const start = (page - 1) * pageSize;
  const pageRows = catalog.slice(start, start + pageSize);

  return NextResponse.json({
    ok: true,
    templates: pageRows,
    total: catalog.length,
    page,
    pageSize,
    source: "system-catalog",
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = (await getTenantContext(session.user.id)).workspace.id;

  try {
    const body = await request.json();
    const {
      templateKey,
      name,
      description,
      category,
      industry,
      sectionTypes,
      previewData,
      isPublic,
      tags,
    } = body;

    if (!templateKey || !name || !description || !category) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!isTemplateCategory(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const existing = await db.templateMarketplaceEntry.findUnique({
      where: {
        workspaceId_templateKey: { workspaceId, templateKey },
      },
    });

    if (existing) {
      return NextResponse.json({ error: "Template key already exists" }, { status: 400 });
    }

    const template = await db.templateMarketplaceEntry.create({
      data: {
        workspaceId,
        templateKey,
        nameJson: name,
        descriptionJson: description,
        category,
        industry,
        sectionTypes: sectionTypes ?? [],
        previewJson: previewData ?? {},
        isPublic: isPublic ?? false,
        isFeatured: false,
        version: 1,
        tags: tags ?? [],
        createdBy: session.user.id,
      },
    });

    await audit({
      userId: session.user.id,
      action: "TEMPLATE_CREATE",
      resource: "TemplateMarketplaceEntry",
      resourceId: template.id,
      details: { templateKey, category },
      success: true,
    });

    return NextResponse.json({ ok: true, template });
  } catch (error) {
    console.error("Template create error:", error);
    return NextResponse.json(
      {
        error:
          "Template storage is not available yet. System catalog remains readable; creating custom templates requires a database migration.",
      },
      { status: 503 },
    );
  }
}
