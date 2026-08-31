import { NextResponse } from "next/server";
import { mappedApiFailure } from "@/lib/api-failure";
import type { CompletionErrorCode } from "@/lib/i18n";
import { requireSession, requireWriter } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import {
  ContractDraftPersistenceError,
  contractDraftWriteSchema,
  deletePersistedContractDraft,
  loadPersistedContractDraft,
  prepareContractDraft,
  updatePersistedContractDraft,
  type ContractDraftReadResult,
  type ContractDraftSummary,
  type ContractDraftWriteInput,
  type PreparedContractDraft,
} from "@/lib/contract-template-persistence";

export const dynamic = "force-dynamic";

export interface ContractDraftReadRouteDependencies {
  readonly getReader: () => Promise<{ readonly userId: string } | null>;
  readonly getWriter: () => Promise<{ readonly userId: string } | null>;
  readonly getWorkspace: (
    userId: string
  ) => Promise<{ readonly id: string }>;
  readonly load: (input: {
    readonly workspaceId: string;
    readonly id: string;
  }) => Promise<ContractDraftReadResult | null>;
  readonly prepare: (input: ContractDraftWriteInput) => PreparedContractDraft;
  readonly updateDraft: (input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly id: string;
    readonly prepared: PreparedContractDraft;
    readonly ipAddress?: string;
    readonly userAgent?: string;
  }) => Promise<{
    readonly updated: boolean;
    readonly revisionAppended: boolean;
    readonly draft: ContractDraftSummary;
  }>;
  readonly deleteDraft: (input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly id: string;
    readonly ipAddress?: string;
    readonly userAgent?: string;
  }) => Promise<{
    readonly deletedId: string;
    readonly releasedStorageBytes: number;
  }>;
}

const productionDependencies: ContractDraftReadRouteDependencies = {
  getReader: async () => {
    const session = await requireSession();
    return session ? { userId: session.user.id } : null;
  },
  getWriter: async () => {
    const session = await requireWriter();
    return session ? { userId: session.user.id } : null;
  },
  getWorkspace: async (userId) => {
    const { workspace } = await getTenantContext(userId);
    return { id: workspace.id };
  },
  load: loadPersistedContractDraft,
  prepare: prepareContractDraft,
  updateDraft: updatePersistedContractDraft,
  deleteDraft: deletePersistedContractDraft,
};

/**
 * Bilingual failure for a single draft.
 *
 * Same reason as the collection route: the message was written in English at
 * the call site, so an Arabic reader got an English rejection. The mapper owns
 * both languages; `code` stays exactly as it was, and typing it as
 * `CompletionErrorCode` means an unregistered one is a build failure rather
 * than a monolingual response nobody notices until a customer complains.
 */
function errorResponse(
  code: CompletionErrorCode,
  status: number
): NextResponse {
  const mapped = mappedApiFailure(code, { status });
  return NextResponse.json(mapped.body, {
    status: mapped.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function handleContractDraftRead(
  id: string,
  dependencies: ContractDraftReadRouteDependencies = productionDependencies
): Promise<NextResponse> {
  const caller = await dependencies.getReader();
  if (!caller) {
    return errorResponse("UNAUTHORIZED", 401);
  }
  if (!/^[A-Za-z0-9_-]{1,200}$/u.test(id)) {
    return errorResponse("CONTRACT_DRAFT_ID_INVALID",
      400
    );
  }
  const workspace = await dependencies.getWorkspace(caller.userId);
  try {
    const draft = await dependencies.load({ workspaceId: workspace.id, id });
    if (!draft) {
      return errorResponse("CONTRACT_DRAFT_NOT_FOUND",
        404
      );
    }
    return NextResponse.json(
      {
        schemaVersion: 1,
        executionAllowed: false,
        draft,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ContractDraftPersistenceError) {
      return errorResponse(error.code, error.status);
    }
    console.error("[contract draft read]", error);
    return errorResponse("CONTRACT_DRAFT_READ_FAILED",
      500
    );
  }
}

export async function handleContractDraftUpdate(
  id: string,
  request: Request,
  dependencies: ContractDraftReadRouteDependencies = productionDependencies
): Promise<NextResponse> {
  const caller = await dependencies.getWriter();
  if (!caller) {
    return errorResponse("FORBIDDEN", 403);
  }
  if (!/^[A-Za-z0-9_-]{1,200}$/u.test(id)) {
    return errorResponse("CONTRACT_DRAFT_ID_INVALID",
      400
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("CONTRACT_DRAFT_BODY_INVALID",
      400
    );
  }

  const parsed = contractDraftWriteSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("CONTRACT_DRAFT_BODY_INVALID",
      400
    );
  }

  const workspace = await dependencies.getWorkspace(caller.userId);
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",", 1)[0]?.trim();
  const userAgent = request.headers.get("user-agent")?.trim();

  try {
    const prepared = dependencies.prepare(parsed.data);
    const result = await dependencies.updateDraft({
      workspaceId: workspace.id,
      userId: caller.userId,
      id,
      prepared,
      ...(ipAddress ? { ipAddress } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    return NextResponse.json(
      {
        schemaVersion: 1,
        executionAllowed: false,
        updated: result.updated,
        revisionAppended: result.revisionAppended,
        draft: result.draft,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ContractDraftPersistenceError) {
      return errorResponse(error.code, error.status);
    }
    console.error("[contract draft PATCH]", error);
    return errorResponse("CONTRACT_DRAFT_UPDATE_FAILED",
      500
    );
  }
}

export async function handleContractDraftDelete(
  id: string,
  request: Request,
  dependencies: ContractDraftReadRouteDependencies = productionDependencies
): Promise<NextResponse> {
  const caller = await dependencies.getWriter();
  if (!caller) {
    return errorResponse("FORBIDDEN", 403);
  }
  if (!/^[A-Za-z0-9_-]{1,200}$/u.test(id)) {
    return errorResponse("CONTRACT_DRAFT_ID_INVALID",
      400
    );
  }
  const workspace = await dependencies.getWorkspace(caller.userId);
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",", 1)[0]?.trim();
  const userAgent = request.headers.get("user-agent")?.trim();
  try {
    const deleted = await dependencies.deleteDraft({
      workspaceId: workspace.id,
      userId: caller.userId,
      id,
      ...(ipAddress ? { ipAddress } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    return NextResponse.json(
      {
        schemaVersion: 1,
        deletedId: deleted.deletedId,
        releasedStorageBytes: deleted.releasedStorageBytes,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof ContractDraftPersistenceError) {
      return errorResponse(error.code, error.status);
    }
    console.error("[contract draft DELETE]", error);
    return errorResponse("CONTRACT_DRAFT_DELETE_FAILED",
      500
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return handleContractDraftRead(id);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return handleContractDraftUpdate(id, request);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return handleContractDraftDelete(id, request);
}
