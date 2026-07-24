import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireWriter } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import {
  admitContractDraftWrite,
  type ContractDraftWriteAdmission,
} from "@/lib/contract-draft-admission";
import {
  ContractDraftPersistenceError,
  MAX_CONTRACT_DRAFT_BODY_BYTES,
  contractDraftListQuerySchema,
  contractDraftWriteSchema,
  listPersistedContractDrafts,
  persistPreparedContractDraft,
  prepareContractDraft,
  type ContractDraftSummary,
  type ContractDraftWriteInput,
  type PreparedContractDraft,
} from "@/lib/contract-template-persistence";

export const dynamic = "force-dynamic";

interface ContractDraftCaller {
  readonly userId: string;
}

interface ContractDraftWorkspace {
  readonly id: string;
}

export interface ContractDraftRouteDependencies {
  readonly getWriter: () => Promise<ContractDraftCaller | null>;
  readonly getReader: () => Promise<ContractDraftCaller | null>;
  readonly getWorkspace: (
    userId: string
  ) => Promise<ContractDraftWorkspace>;
  readonly projectExists: (
    workspaceId: string,
    projectId: string
  ) => Promise<boolean>;
  readonly prepare: (input: ContractDraftWriteInput) => PreparedContractDraft;
  readonly admit: (input: {
    readonly workspaceId: string;
    readonly userId: string;
  }) => Promise<ContractDraftWriteAdmission>;
  readonly persist: (input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly prepared: PreparedContractDraft;
    readonly ipAddress?: string;
    readonly userAgent?: string;
  }) => Promise<{
    readonly created: boolean;
    readonly draft: ContractDraftSummary;
  }>;
  readonly list: (input: {
    readonly workspaceId: string;
    readonly projectId?: string;
    readonly limit: number;
    readonly cursor?: string;
  }) => Promise<{
    readonly drafts: readonly ContractDraftSummary[];
    readonly integrityFailures: number;
    readonly nextCursor: string | null;
  }>;
}

const productionDependencies: ContractDraftRouteDependencies = {
  getWriter: async () => {
    const session = await requireWriter();
    return session ? { userId: session.user.id } : null;
  },
  getReader: async () => {
    const session = await requireSession();
    return session ? { userId: session.user.id } : null;
  },
  getWorkspace: async (userId) => {
    const { workspace } = await getTenantContext(userId);
    return { id: workspace.id };
  },
  projectExists: async (workspaceId, projectId) =>
    Boolean(
      await db.tenderProject.findFirst({
        where: { id: projectId, workspaceId },
        select: { id: true },
      })
    ),
  prepare: prepareContractDraft,
  admit: admitContractDraftWrite,
  persist: persistPreparedContractDraft,
  list: listPersistedContractDrafts,
};

function responseError(
  error: string,
  code: string,
  status: number,
  details?: Record<string, unknown>,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { error, code, ...(details ?? {}) },
    {
      status,
      headers: { "Cache-Control": "no-store", ...(headers ?? {}) },
    }
  );
}

function persistenceErrorResponse(
  error: ContractDraftPersistenceError
): NextResponse {
  return responseError(error.message, error.code, error.status, {
    ...(error.diagnostics.length > 0
      ? { diagnostics: error.diagnostics }
      : {}),
    lifecycle: "DRAFT",
    legalReviewStatus: "UNREVIEWED",
    counselReviewRequired: true,
    isExecutable: false,
    executionAllowed: false,
  });
}

async function readDraftBody(request: Request): Promise<
  | { readonly ok: true; readonly body: ContractDraftWriteInput }
  | { readonly ok: false; readonly response: NextResponse }
> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return {
      ok: false,
      response: responseError(
        "Content-Type must be application/json.",
        "CONTRACT_DRAFT_CONTENT_TYPE_UNSUPPORTED",
        415
      ),
    };
  }

  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    const declaredLength = Number(lengthHeader);
    if (!Number.isFinite(declaredLength) || declaredLength < 0) {
      return {
        ok: false,
        response: responseError(
          "Invalid Content-Length header.",
          "CONTRACT_DRAFT_INVALID_CONTENT_LENGTH",
          400
        ),
      };
    }
    if (declaredLength > MAX_CONTRACT_DRAFT_BODY_BYTES) {
      return {
        ok: false,
        response: responseError(
          "Contract draft request exceeds the request budget.",
          "CONTRACT_DRAFT_BODY_TOO_LARGE",
          413
        ),
      };
    }
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return {
      ok: false,
      response: responseError(
        "Unable to read contract draft request.",
        "CONTRACT_DRAFT_INVALID_JSON",
        400
      ),
    };
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_CONTRACT_DRAFT_BODY_BYTES) {
    return {
      ok: false,
      response: responseError(
        "Contract draft request exceeds the request budget.",
        "CONTRACT_DRAFT_BODY_TOO_LARGE",
        413
      ),
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      response: responseError(
        "Invalid JSON body.",
        "CONTRACT_DRAFT_INVALID_JSON",
        400
      ),
    };
  }
  const parsed = contractDraftWriteSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      response: responseError(
        "Contract draft request is invalid.",
        "CONTRACT_DRAFT_INVALID_REQUEST",
        400,
        {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        }
      ),
    };
  }
  return { ok: true, body: parsed.data };
}

function requestMetadata(request: Request): {
  readonly ipAddress?: string;
  readonly userAgent?: string;
} {
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",", 1)[0]?.trim();
  const userAgent = request.headers.get("user-agent")?.trim();
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

export async function handleContractDraftPost(
  request: Request,
  dependencies: ContractDraftRouteDependencies = productionDependencies
): Promise<NextResponse> {
  const caller = await dependencies.getWriter();
  if (!caller) {
    return responseError("Forbidden", "FORBIDDEN", 403);
  }

  const parsed = await readDraftBody(request);
  if (!parsed.ok) return parsed.response;
  const workspace = await dependencies.getWorkspace(caller.userId);
  const projectId = parsed.body.projectId ?? null;
  if (
    projectId !== null &&
    !(await dependencies.projectExists(workspace.id, projectId))
  ) {
    return responseError(
      "Tender project not found.",
      "CONTRACT_DRAFT_PROJECT_NOT_FOUND",
      404
    );
  }
  const admission = await dependencies.admit({
    workspaceId: workspace.id,
    userId: caller.userId,
  });
  if (!admission.ok) {
    return responseError(
      admission.message,
      admission.code,
      admission.status,
      undefined,
      { "Retry-After": String(admission.retryAfterSeconds) }
    );
  }

  try {
    const prepared = dependencies.prepare(parsed.body);
    const result = await dependencies.persist({
      workspaceId: workspace.id,
      userId: caller.userId,
      prepared,
      ...requestMetadata(request),
    });
    return NextResponse.json(
      {
        schemaVersion: 1,
        created: result.created,
        draft: result.draft,
        diagnostics: prepared.diagnostics,
        lifecycle: "DRAFT",
        legalReviewStatus: "UNREVIEWED",
        counselReviewRequired: true,
        executionAllowed: false,
      },
      {
        status: result.created ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    if (error instanceof ContractDraftPersistenceError) {
      return persistenceErrorResponse(error);
    }
    console.error("[contract draft POST]", error);
    return responseError(
      "Contract draft could not be saved.",
      "CONTRACT_DRAFT_PERSISTENCE_FAILED",
      500
    );
  }
}

export async function handleContractDraftList(
  request: NextRequest,
  dependencies: ContractDraftRouteDependencies = productionDependencies
): Promise<NextResponse> {
  const caller = await dependencies.getReader();
  if (!caller) {
    return responseError("Unauthorized", "UNAUTHORIZED", 401);
  }
  const query = contractDraftListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!query.success) {
    return responseError(
      "Contract draft query is invalid.",
      "CONTRACT_DRAFT_QUERY_INVALID",
      400
    );
  }
  const workspace = await dependencies.getWorkspace(caller.userId);
  if (
    query.data.projectId &&
    !(await dependencies.projectExists(workspace.id, query.data.projectId))
  ) {
    return responseError(
      "Tender project not found.",
      "CONTRACT_DRAFT_PROJECT_NOT_FOUND",
      404
    );
  }

  try {
    const result = await dependencies.list({
      workspaceId: workspace.id,
      ...(query.data.projectId ? { projectId: query.data.projectId } : {}),
      limit: query.data.limit,
      ...(query.data.cursor ? { cursor: query.data.cursor } : {}),
    });
    return NextResponse.json(
      {
        schemaVersion: 1,
        workspaceId: workspace.id,
        executionAllowed: false,
        drafts: result.drafts,
        nextCursor: result.nextCursor,
        integrityFailuresExcluded: result.integrityFailures,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ContractDraftPersistenceError) {
      return persistenceErrorResponse(error);
    }
    console.error("[contract draft GET]", error);
    return responseError(
      "Contract drafts could not be loaded.",
      "CONTRACT_DRAFT_LIST_FAILED",
      500
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleContractDraftPost(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleContractDraftList(request);
}
