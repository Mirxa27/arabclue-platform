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

export async function mintVoiceLiveSession(
  session: Session
): Promise<Experimental_RealtimeSetupResponse & VoiceLiveConfig> {
  const config = await getVoiceLiveConfig();
  if (!config.enabled) {
    throw new Error(config.reason);
  }

  const row = await getProviderForEngine("VOICE");
  if (!row) throw new Error("VOICE provider missing");

  const ctx = await buildPlatformAgentContext(session);
  const tools = createPlatformTools(ctx);
  const toolDefinitions = await experimental_getRealtimeToolDefinitions({
    tools,
  });

  const instructions = buildPlatformAgentInstructions({
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

  const sessionConfig = {
    instructions,
    tools: toolDefinitions,
    inputAudioTranscription: {},
    voice: "alloy" as const,
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

export async function executeVoiceLiveTool(
  session: Session,
  toolName: string,
  args: unknown
): Promise<unknown> {
  const ctx = await buildPlatformAgentContext(session);
  const tools = createPlatformTools(ctx) as Record<
    string,
    { execute?: (input: unknown, opts?: unknown) => Promise<unknown> | unknown }
  >;
  const tool = tools[toolName];
  if (!tool?.execute) {
    throw new Error(`Unknown or non-executable tool: ${toolName}`);
  }
  return tool.execute(args, {
    toolCallId: `voice-${Date.now()}`,
    messages: [],
  });
}
