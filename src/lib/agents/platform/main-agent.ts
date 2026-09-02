import {
  ToolLoopAgent,
  stepCountIs,
  type InferAgentUIMessage,
  type InferUITools,
  type UIMessage,
} from "ai";
import { canWriteRole } from "@/lib/auth";
import { AGENT_CONFIG } from "@/lib/agents/agent-config";
import {
  getTenantContext,
  resolveOwnedProjectId,
} from "@/lib/workspace-context";
import type { Session } from "next-auth";
import { resolveCurrentView, type PlatformAgentContext } from "./context";
import { buildPlatformAgentInstructions } from "./instructions";
import { resolvePlatformAgentModel } from "./model";
import { createPlatformTools, type PlatformTools } from "./tools";

export type PlatformAgentUIMessage = UIMessage<
  never,
  never,
  InferUITools<PlatformTools>
>;

export async function buildPlatformAgentContext(
  session: Session,
  opts?: {
    missionId?: string | null;
    activeProjectId?: string | null;
    currentView?: unknown;
    /** The language on screen, already resolved by the route. */
    locale?: "ar" | "en" | null;
  }
): Promise<PlatformAgentContext> {
  const tenant = await getTenantContext(session.user.id);
  const role = session.user.role;
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  // The UI's language wins over the profile's: the reply lands next to the
  // screen the user is reading, and the two disagreed in production (Arabic
  // shell, English agent) until the Settings page happened to be visited.
  const locale = opts?.locale ?? (session.user.locale === "en" ? "en" : "ar");

  // `activeProjectId` is the only field on this context that can originate from
  // the client (chat body, realtime tool options, mission payload). Every other
  // field is derived from the server session, so this is the one value that has
  // to be re-resolved against the tenant before any tool can query on it. A
  // foreign or unknown identifier degrades to "no active project" rather than
  // failing the request, which keeps an unscoped session usable.
  const activeProjectId = await resolveOwnedProjectId(
    opts?.activeProjectId,
    tenant.workspace.id
  );

  return {
    session,
    workspace: tenant.workspace,
    brandProfile: tenant.brandProfile,
    userId: tenant.userId,
    membershipRole: tenant.membershipRole,
    locale,
    isAdmin,
    canWrite: canWriteRole(role),
    missionId: opts?.missionId ?? null,
    activeProjectId,
    // Same reasoning as `activeProjectId`: client-supplied, so it is resolved
    // here rather than trusted. Unlike it, this one reaches the prompt.
    currentView: resolveCurrentView(opts?.currentView),
  };
}

export async function createPlatformAgent(
  session: Session,
  opts?: {
    missionId?: string | null;
    activeProjectId?: string | null;
    currentView?: unknown;
    locale?: "ar" | "en" | null;
  }
) {
  const ctx = await buildPlatformAgentContext(session, opts);
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
      currentView: ctx.currentView,
    }),
    tools,
    stopWhen: stepCountIs(AGENT_CONFIG.PLATFORM.toolLoopMaxSteps),
    temperature: AGENT_CONFIG.PLATFORM.toolLoopTemperature,
  });

  return { agent, ctx, providerLabel, modelId };
}

/** Compile-time helper for InferAgentUIMessage consumers */
export type PlatformAgentInstance = Awaited<
  ReturnType<typeof createPlatformAgent>
>["agent"];

export type PlatformAgentMessage = InferAgentUIMessage<PlatformAgentInstance>;
