import { db } from "./db";

// Immutable audit trail logger — appends to AuditLog table.
// Every admin action, config change, login, and generation event is recorded.

export interface AuditContext {
  userId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  severity?: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  success?: boolean;
}

export async function audit(ctx: AuditContext): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: ctx.userId ?? null,
        action: ctx.action,
        resource: ctx.resource ?? null,
        resourceId: ctx.resourceId ?? null,
        details: ctx.details ? JSON.stringify(ctx.details) : null,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        severity: ctx.severity ?? "INFO",
        success: ctx.success ?? true,
      },
    });
  } catch (err) {
    // Audit must never break the request flow
    console.error("[audit] failed to write log", err);
  }
}

// Standard action constants
export const AUDIT_ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  LOGIN_FAILED: "LOGIN_FAILED",
  CONFIG_CHANGE: "CONFIG_CHANGE",
  AI_PROVIDER_ACTIVATE: "AI_PROVIDER_ACTIVATE",
  AI_PROVIDER_CREATE: "AI_PROVIDER_CREATE",
  AI_PROVIDER_UPDATE: "AI_PROVIDER_UPDATE",
  AI_PROVIDER_DELETE: "AI_PROVIDER_DELETE",
  ENV_UPDATE: "ENV_UPDATE",
  ENV_ROTATE: "ENV_ROTATE",
  DOC_UPLOAD: "DOC_UPLOAD",
  DOC_DELETE: "DOC_DELETE",
  PROPOSAL_GENERATE: "PROPOSAL_GENERATE",
  ARTIFACT_DOWNLOAD: "ARTIFACT_DOWNLOAD",
  ROLE_CHANGE: "ROLE_CHANGE",
  USER_CREATE: "USER_CREATE",
  USER_DEACTIVATE: "USER_DEACTIVATE",
  BILLING_CHANGE: "BILLING_CHANGE",
  PLAN_CREATE: "PLAN_CREATE",
  PLAN_UPDATE: "PLAN_UPDATE",
  SUBSCRIPTION_UPDATE: "SUBSCRIPTION_UPDATE",
  AGENT_RUN: "AGENT_RUN",
} as const;
