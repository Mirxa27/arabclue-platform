import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { resolveEmailVerifiedClaim } from "@/lib/email-verification-policy";
import { getTenantContext } from "@/lib/workspace-context";
import {
  buildBusinessProfileHTML,
  compileBilingualBusinessProfile,
  generateBilingualBusinessProfilePDF,
  generateBusinessProfilePDF,
  loadBusinessProfile,
  renderBilingualBusinessProfileHTML,
  type BusinessProfileBilingualExportQuality,
  type BusinessProfileSnapshot,
} from "@/lib/business-profile";
import type { CapabilityStatementBuildResult } from "@/lib/capability-statement";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  documentExportGate,
  type DocumentExportAdmission,
} from "@/lib/document-export-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const BILINGUAL_CAPABILITY_EXPORT_BLOCKED_CODE =
  "BILINGUAL_CAPABILITY_EXPORT_BLOCKED" as const;
export const BILINGUAL_CAPABILITY_EXPORT_BLOCKED_MESSAGE =
  "Bilingual capability statement export is blocked by unresolved diagnostics.";

export type BusinessProfileExportFormat = "html" | "pdf";
export type BusinessProfileExportLocale = "ar" | "en" | "bilingual";

interface ExportSession {
  readonly userId: string;
  readonly emailVerified: boolean;
}

interface ExportWorkspace {
  readonly id: string;
  readonly slug: string | null;
}

export interface BusinessProfileDownloadAuditEvent {
  readonly userId: string;
  readonly workspaceId: string;
  readonly format: BusinessProfileExportFormat;
  readonly locale: BusinessProfileExportLocale;
  readonly quality?: BusinessProfileBilingualExportQuality;
}

/**
 * Narrow route dependency boundary. Tests supply pure in-memory functions, so
 * no authentication, database, PDF runtime, or audit sink is touched.
 */
export interface BusinessProfileExportDependencies {
  readonly getSession: () => Promise<ExportSession | null>;
  readonly getWorkspace: (userId: string) => Promise<ExportWorkspace>;
  readonly loadProfile: (
    workspaceId: string
  ) => Promise<BusinessProfileSnapshot>;
  readonly buildLegacyHtml: (
    profile: BusinessProfileSnapshot,
    locale: "ar" | "en"
  ) => string;
  readonly buildLegacyPdf: (
    profile: BusinessProfileSnapshot,
    locale: "ar" | "en"
  ) => Promise<Buffer>;
  readonly compileBilingual: (
    profile: BusinessProfileSnapshot,
    quality: BusinessProfileBilingualExportQuality
  ) => CapabilityStatementBuildResult;
  readonly renderBilingualHtml: (
    compilation: CapabilityStatementBuildResult
  ) => string;
  readonly buildBilingualPdf: (
    compilation: CapabilityStatementBuildResult
  ) => Promise<Buffer>;
  readonly acquirePdfPermit: (input: {
    readonly userId: string;
    readonly workspaceId: string;
    readonly sourceCharacters: number;
  }) => Promise<DocumentExportAdmission>;
  readonly recordDownload: (
    event: BusinessProfileDownloadAuditEvent
  ) => Promise<void>;
}

const productionDependencies: BusinessProfileExportDependencies = {
  getSession: async () => {
    const session = await requireSession();
    return session
      ? {
          userId: session.user.id,
          emailVerified: session.user.emailVerified,
        }
      : null;
  },
  getWorkspace: async (userId) => {
    const { workspace } = await getTenantContext(userId);
    return { id: workspace.id, slug: workspace.slug };
  },
  loadProfile: loadBusinessProfile,
  buildLegacyHtml: (profile, locale) =>
    buildBusinessProfileHTML(profile, {
      locale,
      forPrint: false,
    }),
  buildLegacyPdf: generateBusinessProfilePDF,
  compileBilingual: compileBilingualBusinessProfile,
  renderBilingualHtml: renderBilingualBusinessProfileHTML,
  buildBilingualPdf: generateBilingualBusinessProfilePDF,
  acquirePdfPermit: (input) =>
    documentExportGate.acquire({ ...input, kind: "capability-pdf" }),
  recordDownload: async (event) => {
    const details =
      event.locale === "bilingual"
        ? {
            format: event.format,
            locale: event.locale,
            quality: event.quality ?? "strict",
          }
        : { format: event.format, locale: event.locale };
    await audit({
      userId: event.userId,
      action: AUDIT_ACTIONS.ARTIFACT_DOWNLOAD,
      resource: "BusinessProfile",
      resourceId: event.workspaceId,
      details,
    });
  },
};

export function resolveBusinessProfileExportFormat(
  value: string | null
): BusinessProfileExportFormat {
  // Preserve the legacy behavior: every non-HTML value resolves to PDF.
  return value === "html" ? "html" : "pdf";
}

export function resolveBusinessProfileExportLocale(
  value: string | null
): BusinessProfileExportLocale {
  if (value === "bilingual") return "bilingual";
  // Preserve the legacy behavior: every non-English value resolves to Arabic.
  return value === "en" ? "en" : "ar";
}

export function resolveBusinessProfileExportQuality(
  value: string | null
): BusinessProfileBilingualExportQuality {
  // Draft export requires explicit opt-in; unknown values remain strict.
  return value === "draft" ? "draft" : "strict";
}

function htmlResponse(html: string, filename: string): NextResponse {
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}

function pdfResponse(pdf: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function blockedBilingualExportResponse(
  compilation: CapabilityStatementBuildResult
): NextResponse {
  return NextResponse.json(
    {
      error: BILINGUAL_CAPABILITY_EXPORT_BLOCKED_MESSAGE,
      code: BILINGUAL_CAPABILITY_EXPORT_BLOCKED_CODE,
      status: "blocked",
      diagnostics: compilation.blockingDiagnostics,
    },
    { status: 422 }
  );
}

function exportAdmissionDeniedResponse(
  denial: Exclude<DocumentExportAdmission, { ok: true }>
): NextResponse {
  return NextResponse.json(
    { error: denial.message, code: denial.code },
    {
      status: denial.status,
      headers:
        denial.retryAfterSeconds === null
          ? undefined
          : { "Retry-After": String(denial.retryAfterSeconds) },
    }
  );
}

async function recordSuccessfulDownload(
  dependencies: BusinessProfileExportDependencies,
  event: BusinessProfileDownloadAuditEvent
): Promise<void> {
  await dependencies.recordDownload(event).catch(() => {
    // Export success must not be converted to a failure by audit availability.
  });
}

/**
 * GET ?format=pdf|html&locale=ar|en|bilingual&quality=strict|draft
 *
 * `quality` only applies to bilingual output. Strict is the safe default and
 * returns a stable 422 diagnostic response when source evidence is incomplete.
 */
export async function handleBusinessProfileExport(
  req: NextRequest,
  dependencies: BusinessProfileExportDependencies = productionDependencies
): Promise<NextResponse> {
  const session = await dependencies.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!resolveEmailVerifiedClaim(session.emailVerified)) {
    return NextResponse.json(
      { error: "EMAIL_VERIFICATION_REQUIRED" },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const workspace = await dependencies.getWorkspace(session.userId);
  const format = resolveBusinessProfileExportFormat(
    req.nextUrl.searchParams.get("format")
  );
  const locale = resolveBusinessProfileExportLocale(
    req.nextUrl.searchParams.get("locale")
  );
  const quality = resolveBusinessProfileExportQuality(
    req.nextUrl.searchParams.get("quality")
  );
  const profile = await dependencies.loadProfile(workspace.id);
  const slug = workspace.slug || "company";
  const sourceCharacters = JSON.stringify(profile).length;

  if (locale === "bilingual") {
    const compilation = dependencies.compileBilingual(profile, quality);
    if (!compilation.canExport) {
      return blockedBilingualExportResponse(compilation);
    }

    if (format === "html") {
      const html = dependencies.renderBilingualHtml(compilation);
      await recordSuccessfulDownload(dependencies, {
        userId: session.userId,
        workspaceId: workspace.id,
        format,
        locale,
        quality,
      });
      return htmlResponse(
        html,
        `${slug}-capability-statement-bilingual.html`
      );
    }

    const admission = await dependencies.acquirePdfPermit({
      userId: session.userId,
      workspaceId: workspace.id,
      sourceCharacters,
    });
    if (!admission.ok) return exportAdmissionDeniedResponse(admission);
    try {
      const pdf = await dependencies.buildBilingualPdf(compilation);
      await recordSuccessfulDownload(dependencies, {
        userId: session.userId,
        workspaceId: workspace.id,
        format,
        locale,
        quality,
      });
      return pdfResponse(
        pdf,
        `${slug}-capability-statement-bilingual.pdf`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        {
          error: `PDF generation failed: ${message}`,
          code: "PDF_UNAVAILABLE",
        },
        { status: 503 }
      );
    } finally {
      await admission.permit.release();
    }
  }

  if (format === "html") {
    const html = dependencies.buildLegacyHtml(profile, locale);
    await recordSuccessfulDownload(dependencies, {
      userId: session.userId,
      workspaceId: workspace.id,
      format,
      locale,
    });
    return htmlResponse(html, `${slug}-business-profile.html`);
  }

  const admission = await dependencies.acquirePdfPermit({
    userId: session.userId,
    workspaceId: workspace.id,
    sourceCharacters,
  });
  if (!admission.ok) return exportAdmissionDeniedResponse(admission);
  try {
    const pdf = await dependencies.buildLegacyPdf(profile, locale);
    await recordSuccessfulDownload(dependencies, {
      userId: session.userId,
      workspaceId: workspace.id,
      format,
      locale,
    });
    return pdfResponse(pdf, `${slug}-business-profile-${locale}.pdf`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: `PDF generation failed: ${message}`,
        code: "PDF_UNAVAILABLE",
      },
      { status: 503 }
    );
  } finally {
    await admission.permit.release();
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleBusinessProfileExport(req);
}
