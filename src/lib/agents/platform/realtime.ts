/**
 * Voice live (speech-to-speech) session setup for OpenAI Realtime + Gemini Live.
 * Model IDs come only from the active Admin VOICE provider connection.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { experimental_getRealtimeToolDefinitions } from "ai";
import type { Experimental_RealtimeSetupResponse } from "ai";
import { resolveProviderApiKey } from "@/lib/env-settings";
import { getProviderForEngine } from "@/lib/llm";
import {
  normalizeOpenAiBase,
  requireConfiguredModelId,
} from "@/lib/llm/model-catalog";
import { buildPlatformAgentInstructions } from "./instructions";
import { buildPlatformAgentContext } from "./main-agent";
import { createPlatformTools } from "./tools";
import type { Session } from "next-auth";
import type {
  VoiceLiveConfig,
  VoiceLiveConfigResponse,
  VoiceLiveProviderKind,
} from "./voice-types";

export type {
  VoiceLiveConfig,
  VoiceLiveConfigResponse,
  VoiceLiveProviderKind,
} from "./voice-types";

function toVoiceProviderKind(provider: string): VoiceLiveProviderKind | null {
  const p = provider.toLowerCase();
  if (p === "openai" || p === "azure_openai") return "openai";
  if (p === "google" || p === "gemini") return "google";
  return null;
}

export async function getVoiceLiveConfig(): Promise<VoiceLiveConfigResponse> {
  const row = await getProviderForEngine("VOICE");
  if (!row || !row.isActive) {
    return {
      enabled: false,
      reason:
        "No active VOICE provider. Add OpenAI Realtime or Gemini Live under Admin → AI Providers (Voice live engine).",
    };
  }
  const kind = toVoiceProviderKind(row.provider);
  if (!kind) {
    return {
      enabled: false,
      reason: `Provider "${row.provider}" is not supported for live voice. Use OpenAI or Google (Gemini).`,
    };
  }
  let modelId: string;
  try {
    modelId = requireConfiguredModelId(row.modelId);
  } catch {
    return {
      enabled: false,
      reason:
        "VOICE provider has no model selected. Fetch models and choose a live/realtime model.",
    };
  }
  return {
    enabled: true,
    provider: kind,
    providerLabel: row.provider,
    connectionName: row.name,
    modelId,
    engine: "VOICE",
  };
}

/**
 * Resolve the mission and agent context backing a voice request.
 *
 * `activeProjectId` reaches this module from the browser, so it is resolved
 * against the tenant *before* `getOrCreateMission` can persist it. Persisting
 * an unresolved identifier would make it look server-derived on every later
 * turn of the conversation. A foreign or unknown identifier degrades to "no
 * active project" rather than failing the session.
 */
async function resolveVoiceMissionContext(
  session: Session,
  opts?: { missionId?: string | null; activeProjectId?: string | null }
) {
  const { getOrCreateMission } = await import("./mission");
  const { resolveOwnedProjectId } = await import("@/lib/workspace-context");
  const base = await buildPlatformAgentContext(session);
  const requestedProjectId = await resolveOwnedProjectId(
    opts?.activeProjectId,
    base.workspace.id
  );
  const mission = await getOrCreateMission({
    workspaceId: base.workspace.id,
    userId: base.userId,
    locale: base.locale,
    activeProjectId: requestedProjectId ?? undefined,
  });
  const ctx = await buildPlatformAgentContext(session, {
    missionId: opts?.missionId || mission.id,
    activeProjectId: requestedProjectId ?? mission.activeProjectId ?? null,
  });
  return { mission, ctx };
}

export async function mintVoiceLiveSession(
  session: Session,
  opts?: {
    missionId?: string | null;
    activeProjectId?: string | null;
    voice?: string | null;
    style?: string | null;
  }
): Promise<Experimental_RealtimeSetupResponse & VoiceLiveConfig> {
  const config = await getVoiceLiveConfig();
  if (!config.enabled) {
    throw new Error(config.reason);
  }

  const row = await getProviderForEngine("VOICE");
  if (!row) throw new Error("VOICE provider missing");

  const { mission, ctx } = await resolveVoiceMissionContext(session, opts);
  const tools = createPlatformTools(ctx);
  const toolDefinitions = await experimental_getRealtimeToolDefinitions({
    tools,
  });

  const baseInstructions = buildPlatformAgentInstructions({
    locale: ctx.locale,
    userName: session.user.name || session.user.email,
    userRole: session.user.role,
    workspaceName:
      (ctx.locale === "ar"
        ? ctx.workspace.nameAr ?? ctx.workspace.name
        : ctx.workspace.name) || ctx.workspace.name,
    canWrite: ctx.canWrite,
    isAdmin: ctx.isAdmin,
  });

  const { resolveVoice, styleInstruction } = await import("./voice-options");
  const voice = resolveVoice(config.provider, opts?.voice);
  const styleSuffix = styleInstruction(opts?.style);
  const instructions = styleSuffix
    ? `${baseInstructions}\n\n## Delivery\n${styleSuffix}`
    : baseInstructions;

  const sessionConfig = {
    instructions,
    tools: toolDefinitions,
    inputAudioTranscription: {},
    voice,
    turnDetection: { type: "server-vad" as const },
  };

  const key = await resolveProviderApiKey(row.provider, row.apiKeyEnvKey);
  if (!key) {
    throw new Error(
      `API key missing for VOICE provider (${row.apiKeyEnvKey || "default env"}).`
    );
  }

  if (config.provider === "openai") {
    const baseURL =
      normalizeOpenAiBase(row.apiBase || "https://api.openai.com/v1") ||
      "https://api.openai.com/v1";
    const openai = createOpenAI({ apiKey: key, baseURL });
    const token = await openai.experimental_realtime.getToken({
      model: config.modelId,
      sessionConfig,
      expiresAfterSeconds: 60,
    });
    return {
      ...token,
      tools: toolDefinitions,
      ...config,
    };
  }

  const baseURL = (
    row.apiBase || "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/$/, "");
  const google = createGoogleGenerativeAI({
    apiKey: key,
    baseURL,
  });
  const token = await google.experimental_realtime.getToken({
    model: config.modelId,
    sessionConfig,
    expiresAfterSeconds: 60,
  });
  return {
    ...token,
    tools: toolDefinitions,
    ...config,
  };
}

type VoiceExecutableTool = {
  execute?: (input: unknown, opts?: unknown) => Promise<unknown> | unknown;
  inputSchema?: unknown;
};

/**
 * Validate a voice tool call against the tool's declared `inputSchema`.
 *
 * The AI SDK's `tool()` helper is an identity function: `inputSchema` is
 * enforced by the tool-calling loop inside `streamText`/`generateText`, not by
 * `execute` itself. This endpoint dispatches to `execute` directly, so without
 * this step the browser could invoke every registered tool with arbitrary,
 * unvalidated arguments.
 *
 * Fails closed. A tool that declares a schema we cannot evaluate is a
 * programming error, and admitting the call would reintroduce the same gap.
 */
export function validateVoiceToolInput(
  toolName: string,
  tool: VoiceExecutableTool,
  args: unknown
): unknown {
  const schema = tool.inputSchema;
  if (schema === undefined || schema === null) return args;

  // Zod (and anything else implementing Standard Schema v1).
  const zodLike = schema as {
    safeParse?: (value: unknown) => { success: boolean; data?: unknown };
  };
  if (typeof zodLike.safeParse === "function") {
    const parsed = zodLike.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for tool: ${toolName}`);
    }
    return parsed.data;
  }

  const standard = schema as {
    "~standard"?: {
      validate: (value: unknown) => { issues?: unknown; value?: unknown };
    };
  };
  const validate = standard["~standard"]?.validate;
  if (typeof validate === "function") {
    const result = validate(args);
    if (result.issues) {
      throw new Error(`Invalid arguments for tool: ${toolName}`);
    }
    return result.value;
  }

  throw new Error(`Tool ${toolName} declares an unvalidatable input schema`);
}

export async function executeVoiceLiveTool(
  session: Session,
  toolName: string,
  args: unknown,
  opts?: { missionId?: string | null; activeProjectId?: string | null }
): Promise<unknown> {
  const { ctx } = await resolveVoiceMissionContext(session, opts);
  const tools = createPlatformTools(ctx) as Record<string, VoiceExecutableTool>;
  const tool = tools[toolName];
  if (!tool?.execute) {
    throw new Error(`Unknown or non-executable tool: ${toolName}`);
  }
  return tool.execute(validateVoiceToolInput(toolName, tool, args), {
    toolCallId: `voice-${crypto.randomUUID()}`,
    messages: [],
  });
}
