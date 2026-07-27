import { NextRequest } from "next/server";
import { withTenant, jsonOk, jsonApiFailure } from "@/lib/api-controller";
import { db } from "@/lib/db";
import {
  listClauses,
  createCustomClause,
  MAX_CLAUSE_LIST_TAKE,
} from "@/lib/clause-library";
import { seedStandardClausesWithPrisma } from "@/lib/clause-library-prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withTenant(
    "session",
    async (ctx) => {
      {
        const url = new URL(request.url);
        const category = url.searchParams.get("category") || undefined;
        const mandatoryParam = url.searchParams.get("mandatory");
        const cursor = url.searchParams.get("cursor") || undefined;
        const takeParam = url.searchParams.get("take") || url.searchParams.get("limit");
        const search = url.searchParams.get("search") || url.searchParams.get("q") || undefined;
        let mandatory: boolean | undefined;
        if (mandatoryParam !== null) {
          if (mandatoryParam === "true" || mandatoryParam === "1") mandatory = true;
          else if (mandatoryParam === "false" || mandatoryParam === "0") mandatory = false;
        }
        const take = takeParam ? Math.min(parseInt(takeParam, 10) || 25, MAX_CLAUSE_LIST_TAKE) : 25;

        // A missing `StandardClause` relation propagates to the central mapper,
        // which answers HTTP 503 SCHEMA_MIGRATION_PENDING (requirement 16.2).
        const count = await db.standardClause.count({ where: { workspaceId: null } });
        if (count === 0) {
          await seedStandardClausesWithPrisma().catch(() => {});
        }

        const result = await listClauses({
          category,
          mandatory,
          workspaceId: ctx.workspace.id,
          cursor,
          take,
          search,
        });

        return jsonOk({
          clauses: result.clauses,
          nextCursor: result.nextCursor,
          count: result.clauses.length,
        });
      }
    },
    "clauses:list"
  );
}

export async function POST(request: NextRequest) {
  return withTenant(
    "writer",
    async (ctx) => {
      {
        const body = await request.json().catch(() => null);
        if (!body) return jsonApiFailure("CLAUSE_FIELD_INVALID");

        const category = (body.category ?? "GENERAL").toString().trim();
        const arabicText = body.arabicText ?? body.contentAr ?? body.ar ?? "";
        const englishText = body.englishText ?? body.contentEn ?? body.en ?? "";
        const titleEn = body.titleEn ?? body.nameEn ?? undefined;
        const titleAr = body.titleAr ?? body.nameAr ?? undefined;
        const mandatory = Boolean(body.mandatory);

        const created = await createCustomClause({
          workspaceId: ctx.workspace.id,
          category,
          arabicText: arabicText.toString(),
          englishText: englishText.toString(),
          titleEn: titleEn?.toString(),
          titleAr: titleAr?.toString(),
          mandatory,
        });

        return jsonOk({ clause: created }, { status: 201 });
      }
    },
    "clauses:create"
  );
}
