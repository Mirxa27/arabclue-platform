import { NextRequest } from "next/server";
import { withTenant, jsonOk, jsonApiFailure } from "@/lib/api-controller";
import { db } from "@/lib/db";
import {
  getTemplateVersion,
  getWorkspaceTemplate,
  validateWorkspaceTemplateContent,
} from "@/lib/contract-template-authoring";
import type { WorkspaceTemplateNode } from "@/lib/contract-template-schema";

export const dynamic = "force-dynamic";

function renderNodes(nodes: readonly WorkspaceTemplateNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "TEXT") return node.value;
      if (node.type === "VARIABLE") return `[${node.variableKey}]`;
      return "";
    })
    .join("");
}

/**
 * Workspace-template preview — tenant-scoped, version-isolated HTML from the
 * persisted current (or requested) immutable version. Does not reuse the
 * catalog compiler because workspace content is not a catalog key.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant(
    "session",
    async (ctx) => {
      const { id } = await params;
      const versionId = new URL(request.url).searchParams.get("versionId");

      const template = await getWorkspaceTemplate({
        workspaceId: ctx.workspace.id,
        templateId: id,
      });
      if (!template) return jsonApiFailure("TEMPLATE_NOT_FOUND");

      let sections: unknown;
      let variables: unknown;
      let clauseBindings: unknown;
      let versionLabel = template.version;
      let canonicalHash = template.canonicalHash;

      if (versionId) {
        const version = await getTemplateVersion({
          workspaceId: ctx.workspace.id,
          templateId: id,
          versionId,
        });
        if (!version) return jsonApiFailure("TEMPLATE_VERSION_NOT_FOUND");
        sections = version.sections;
        variables = version.variables;
        clauseBindings = version.clauseBindings;
        versionLabel = version.version;
        canonicalHash = version.canonicalHash;
      } else {
        const row = await db.contractTemplate.findFirst({
          where: {
            id,
            workspaceId: ctx.workspace.id,
            isSystem: false,
          },
          select: {
            sectionsJson: true,
            variablesJson: true,
            clausesJson: true,
          },
        });
        if (!row) return jsonApiFailure("TEMPLATE_NOT_FOUND");
        sections = JSON.parse(row.sectionsJson);
        variables = JSON.parse(row.variablesJson);
        clauseBindings = JSON.parse(row.clausesJson);
      }

      const content = validateWorkspaceTemplateContent({
        sections,
        variables,
        clauseBindings,
      });

      const arabicHtml = content.content.sections
        .map(
          (section) =>
            `<section data-key="${section.key}"><h2>${section.titleAr}</h2><p>${renderNodes(section.contentAr)}</p></section>`
        )
        .join("\n");
      const englishHtml = content.content.sections
        .map(
          (section) =>
            `<section data-key="${section.key}"><h2>${section.titleEn}</h2><p>${renderNodes(section.contentEn)}</p></section>`
        )
        .join("\n");

      return jsonOk({
        templateId: template.id,
        version: versionLabel,
        canonicalHash,
        legalReviewStatus: content.safety.legalReviewStatus,
        counselReviewRequired: content.safety.counselReviewRequired,
        isExecutable: content.safety.isExecutable,
        preview: {
          ar: { dir: "rtl", html: arabicHtml },
          en: { dir: "ltr", html: englishHtml },
        },
      });
    },
    "workspace-templates:preview"
  );
}
