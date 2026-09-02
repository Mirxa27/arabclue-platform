import { NextResponse } from "next/server";
import { jsonApiFailure } from "@/lib/api-controller";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import {
  CONTRACT_TEMPLATE_KEYS,
  getContractTemplate,
} from "@/lib/document-templates/contract-templates";

export const dynamic = "force-dynamic";

export function contractTemplateCatalogResponse() {
  return CONTRACT_TEMPLATE_KEYS.map((key) => {
    const template = getContractTemplate(key);
    if (!template) {
      throw new Error(`Contract template catalog is missing "${key}".`);
    }
    return {
      key: template.key,
      version: template.version,
      versionId: template.versionId,
      canonicalHash: template.canonicalHash,
      lifecycle: template.lifecycle,
      legalReviewStatus: template.legalReview.status,
      counselReviewRequired: template.counselReviewRequired,
      name: template.name,
      summary: template.summary,
      intendedUse: template.intendedUse,
      disclaimer: template.disclaimer,
      reviewFocus: template.reviewFocus,
      languagePolicy: template.languagePolicy,
      variables: template.variables,
      sections: template.sections.map((section) => ({
        key: section.key,
        title: section.title,
        clauseCount: section.clauseIds.length,
      })),
    };
  });
}

export async function GET(): Promise<NextResponse> {
  const session = await requireSession();
  if (!session) {
    return jsonApiFailure("UNAUTHORIZED", { status: 401 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  return NextResponse.json({
    schemaVersion: 1,
    workspaceId: workspace.id,
    lifecycle: "DRAFT",
    legalReviewStatus: "UNREVIEWED",
    executionAllowed: false,
    templates: contractTemplateCatalogResponse(),
  });
}

