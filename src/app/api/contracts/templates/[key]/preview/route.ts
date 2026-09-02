import { NextRequest, NextResponse } from "next/server";
import { apiFailure, jsonApiFailure } from "@/lib/api-controller";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  compileContractTemplateDocument,
  generateContractTemplateDocumentPdf,
  renderContractTemplateDocumentHTML,
  type ContractTemplateDocumentCompilation,
} from "@/lib/document-templates/contract-template-renderer";
import {
  documentExportGate,
  type DocumentExportAdmission,
} from "@/lib/document-export-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TEMPLATE_REQUEST_BYTES = 256 * 1_024;

const requestSchema = z
  .object({
    mode: z.enum(["PREVIEW", "FINAL"]).default("PREVIEW"),
    bindings: z.record(z.string().min(1).max(160), z.unknown()).default({}),
  })
  .strict();

type TemplateRequestBody = z.infer<typeof requestSchema>;

interface TemplatePreviewSession {
  readonly userId: string;
}

interface TemplatePreviewWorkspace {
  readonly id: string;
}

export interface ContractTemplatePreviewDependencies {
  readonly getSession: () => Promise<TemplatePreviewSession | null>;
  readonly getWorkspace: (
    userId: string
  ) => Promise<TemplatePreviewWorkspace>;
  readonly compile: (
    key: string,
    bindings: Readonly<Record<string, unknown>>,
    mode: "PREVIEW" | "FINAL"
  ) => ContractTemplateDocumentCompilation;
  readonly renderHtml: (
    compilation: ContractTemplateDocumentCompilation
  ) => string;
  readonly renderPdf: (
    compilation: ContractTemplateDocumentCompilation
  ) => Promise<Buffer>;
  readonly acquirePdfPermit: (input: {
    readonly userId: string;
    readonly workspaceId: string;
    readonly sourceCharacters: number;
  }) => Promise<DocumentExportAdmission>;
  readonly recordPreview: (input: {
    readonly userId: string;
    readonly workspaceId: string;
    readonly templateKey: string;
    readonly format: "html" | "pdf";
    readonly mode: "PREVIEW" | "FINAL";
  }) => Promise<void>;
}

const productionDependencies: ContractTemplatePreviewDependencies = {
  getSession: async () => {
    const session = await requireSession();
    return session ? { userId: session.user.id } : null;
  },
  getWorkspace: async (userId) => {
    const { workspace } = await getTenantContext(userId);
    return { id: workspace.id };
  },
  compile: (key, bindings, mode) =>
    compileContractTemplateDocument(key, bindings, { mode }),
  renderHtml: renderContractTemplateDocumentHTML,
  renderPdf: async (compilation) =>
    (await generateContractTemplateDocumentPdf(compilation)).pdf,
  acquirePdfPermit: (input) =>
    documentExportGate.acquire({ ...input, kind: "contract-template-pdf" }),
  recordPreview: async (input) => {
    await audit({
      userId: input.userId,
      action: AUDIT_ACTIONS.ARTIFACT_DOWNLOAD,
      resource: "ContractTemplateDraft",
      resourceId: input.templateKey,
      details: {
        workspaceId: input.workspaceId,
        format: input.format,
        mode: input.mode,
        lifecycle: "DRAFT",
        legalReviewStatus: "UNREVIEWED",
      },
    });
  },
};

function resolveFormat(value: string | null): "html" | "pdf" | null {
  if (value === null || value === "html") return "html";
  if (value === "pdf") return "pdf";
  return null;
}

function deniedResponse(
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

async function parseRequestBody(
  request: NextRequest
): Promise<
  | { ok: true; body: TemplateRequestBody; sourceCharacters: number }
  | { ok: false; response: NextResponse }
> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_TEMPLATE_REQUEST_BYTES
  ) {
    return {
      ok: false,
      response: jsonApiFailure("CONTRACT_TEMPLATE_REQUEST_TOO_LARGE", { status: 413 }),
    };
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_TEMPLATE_REQUEST_BYTES) {
    return {
      ok: false,
      response: jsonApiFailure("CONTRACT_TEMPLATE_REQUEST_TOO_LARGE", { status: 413 }),
    };
  }
  let value: unknown;
  try {
    value = raw.trim().length > 0 ? JSON.parse(raw) : {};
  } catch {
    return {
      ok: false,
      response: jsonApiFailure("CONTRACT_TEMPLATE_REQUEST_INVALID", { status: 400 }),
    };
  }
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonApiFailure("CONTRACT_TEMPLATE_REQUEST_INVALID", {
        status: 400,
        fieldPaths: parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean),
      }),
    };
  }
  return {
    ok: true,
    body: parsed.data,
    sourceCharacters: raw.length,
  };
}

export async function handleContractTemplatePreview(
  request: NextRequest,
  key: string,
  dependencies: ContractTemplatePreviewDependencies = productionDependencies
): Promise<NextResponse> {
  const session = await dependencies.getSession();
  if (!session) {
    return jsonApiFailure("UNAUTHORIZED", { status: 401 });
  }
  const format = resolveFormat(request.nextUrl.searchParams.get("format"));
  if (!format) {
    return jsonApiFailure("CONTRACT_TEMPLATE_FORMAT_INVALID", { status: 400, fieldPaths: ["format"] });
  }
  const parsed = await parseRequestBody(request);
  if (!parsed.ok) return parsed.response;
  const workspace = await dependencies.getWorkspace(session.userId);
  const compilation = dependencies.compile(
    key,
    parsed.body.bindings,
    parsed.body.mode
  );
  if (compilation.status === "BLOCKED" || compilation.document === null) {
    return NextResponse.json(
      {
        ...apiFailure("CONTRACT_TEMPLATE_BLOCKED"),
        lifecycle: "DRAFT",
        legalReviewStatus: "UNREVIEWED",
        diagnostics: compilation.diagnostics,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    );
  }

  let permit:
    | Extract<DocumentExportAdmission, { ok: true }>["permit"]
    | null = null;
  if (format === "pdf") {
    const admission = await dependencies.acquirePdfPermit({
      userId: session.userId,
      workspaceId: workspace.id,
      sourceCharacters: parsed.sourceCharacters,
    });
    if (!admission.ok) return deniedResponse(admission);
    permit = admission.permit;
  }

  try {
    const filename = `${key}-unreviewed-draft.${format}`;
    const body =
      format === "pdf"
        ? await dependencies.renderPdf(compilation)
        : Buffer.from(dependencies.renderHtml(compilation), "utf8");
    await dependencies
      .recordPreview({
        userId: session.userId,
        workspaceId: workspace.id,
        templateKey: key,
        format,
        mode: parsed.body.mode,
      })
      .catch(() => {});
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type":
          format === "pdf"
            ? "application/pdf"
            : "text/html; charset=utf-8",
        "Content-Disposition": `${
          format === "pdf" ? "attachment" : "inline"
        }; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Contract-Lifecycle": "DRAFT",
        "X-Legal-Review-Status": "UNREVIEWED",
        "X-Contract-Executable": "false",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Contract template rendering failed: ${error.message}`
            : "Contract template rendering failed.",
        code: "CONTRACT_TEMPLATE_RENDER_FAILED",
      },
      { status: 503 }
    );
  } finally {
    await permit?.release();
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
): Promise<NextResponse> {
  const { key } = await params;
  return handleContractTemplatePreview(request, key);
}
