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
    const severity = ctx.severity ?? "INFO";
    if (
      severity === "WARN" ||
      severity === "ERROR" ||
      severity === "CRITICAL" ||
      ctx.action === "ARTIFACT_DOWNLOAD" ||
      ctx.action === "PROPOSAL_GENERATE"
    ) {
      const { notifyWebhook } = await import("./outbound-webhook");
      notifyWebhook({
        event: `audit.${ctx.action}`,
        userId: ctx.userId,
        resource: ctx.resource,
        resourceId: ctx.resourceId,
        data: {
          severity,
          success: ctx.success ?? true,
          ...(ctx.details ?? {}),
        },
      });
    }
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
  DOC_VERSION_UPLOAD: "DOC_VERSION_UPLOAD",
  PROJECT_CREATE: "PROJECT_CREATE",
  PROJECT_UPDATE: "PROJECT_UPDATE",
  PROJECT_DELETE: "PROJECT_DELETE",
  PROPOSAL_GENERATE: "PROPOSAL_GENERATE",
  PROPOSAL_EDIT: "PROPOSAL_EDIT",
  FINANCIAL_UPDATE: "FINANCIAL_UPDATE",
  ARTIFACT_DOWNLOAD: "ARTIFACT_DOWNLOAD",
  ROLE_CHANGE: "ROLE_CHANGE",
  USER_CREATE: "USER_CREATE",
  USER_DEACTIVATE: "USER_DEACTIVATE",
  BILLING_CHANGE: "BILLING_CHANGE",
  BILLING_CALLBACK: "BILLING_CALLBACK",
  PLAN_CREATE: "PLAN_CREATE",
  PLAN_UPDATE: "PLAN_UPDATE",
  SUBSCRIPTION_UPDATE: "SUBSCRIPTION_UPDATE",
  AGENT_RUN: "AGENT_RUN",
  PROFILE_UPDATE: "PROFILE_UPDATE",
  MFA_ENABLE: "MFA_ENABLE",
  MFA_DISABLE: "MFA_DISABLE",
  MFA_FAILED: "MFA_FAILED",
  WORKSPACE_UPDATE: "WORKSPACE_UPDATE",
  WORKSPACE_SWITCH: "WORKSPACE_SWITCH",
} as const;
