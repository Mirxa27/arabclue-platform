import {
  ToolLoopAgent,
  stepCountIs,
  type InferAgentUIMessage,
  type InferUITools,
  type UIMessage,
} from "ai";
import { canWriteRole } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import type { Session } from "next-auth";
import type { PlatformAgentContext } from "./context";
import { buildPlatformAgentInstructions } from "./instructions";
import { resolvePlatformAgentModel } from "./model";
import { createPlatformTools, type PlatformTools } from "./tools";

export type PlatformAgentUIMessage = UIMessage<
  never,
  never,
  InferUITools<PlatformTools>
>;

export async function buildPlatformAgentContext(
  session: Session
): Promise<PlatformAgentContext> {
  const tenant = await getTenantContext(session.user.id);
  const role = session.user.role;
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const locale = session.user.locale === "en" ? "en" : "ar";

  return {
    session,
    workspace: tenant.workspace,
    brandProfile: tenant.brandProfile,
    userId: tenant.userId,
    membershipRole: tenant.membershipRole,
    locale,
    isAdmin,
    canWrite: canWriteRole(role),
  };
}

export async function createPlatformAgent(session: Session) {
  const ctx = await buildPlatformAgentContext(session);
  const { model, providerLabel, modelId } = await resolvePlatformAgentModel();
  const tools = createPlatformTools(ctx);

  const agent = new ToolLoopAgent({
    id: "arabclue-platform-copilot",
    model,
    instructions: buildPlatformAgentInstructions({
      locale: ctx.locale,
      userName: session.user.name || session.user.email,
      userRole: session.user.role,
      workspaceName:
        (ctx.locale === "ar"
          ? ctx.workspace.nameAr ?? ctx.workspace.name
          : ctx.workspace.name) || ctx.workspace.name,
      canWrite: ctx.canWrite,
      isAdmin: ctx.isAdmin,
    }),
    tools,
    stopWhen: stepCountIs(24),
    temperature: 0.3,
  });

  return { agent, ctx, providerLabel, modelId };
}

/** Compile-time helper for InferAgentUIMessage consumers */
export type PlatformAgentInstance = Awaited<
  ReturnType<typeof createPlatformAgent>
>["agent"];

export type PlatformAgentMessage = InferAgentUIMessage<PlatformAgentInstance>;
