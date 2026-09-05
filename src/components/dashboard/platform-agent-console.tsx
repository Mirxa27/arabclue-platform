"use client";

import {
  apiErrorText,
  sdkErrorText,
  selectApiFailureCode,
} from "@/lib/api-failure-message";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { browserStorage } from "@/lib/browser-storage";
import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
import { viewLabel } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Loader2,
  Mic,
  MicOff,
  Send,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCopilotProcessing } from "@/hooks/use-copilot-processing";
import type { PlatformAgentUIMessage } from "@/lib/agents/platform/main-agent";
import type { VoiceLiveConfigResponse } from "@/lib/agents/platform/voice-types";
import {
  extractTheaterTools,
  humanActionLabel,
  isToolRunning,
  summarizeStoredOutput,
  summarizeToolOutput,
  type MissionFeedItem,
  type TheaterToolEvent,
} from "@/lib/agents/platform/mission-tool-parts";
import {
  resolveAgentStatus,
  type LiveTransport,
} from "@/lib/agents/platform/agent-status";
import { providerDisplayName } from "@/lib/ai/provider-label";
import { resolveMissionStarters, type MissionReadiness } from "@/lib/mission-starters";
import { LiveVoiceSession } from "./live-voice-session";
import { MissionAttachmentTray } from "./mission-attachment-tray";
import { MissionPerformanceStage } from "./mission-performance-fx";
import { MissionExtensionBridge } from "./mission-extension-bridge";
import { MissionPulseWidget } from "./mission-pulse-widget";
import { MissionControlShell } from "./mission-control-shell";
import { MissionStage } from "./mission-stage";
import { MissionConversation } from "./mission-conversation";
import { CopilotProcessingView } from "./copilot-processing-view";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: {
    results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
  }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Where the console remembers which mode the person last worked in. */
const MODE_STORAGE_KEY = "arabclue:mission:mode";

/** The stable code inside an AI SDK transport error, when its body is ours. */
function sdkErrorCode(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : "";
  try {
    return selectApiFailureCode(JSON.parse(raw));
  } catch {
    return null;
  }
}

type PendingApproval = {
  approvalId: string;
  toolName: string;
  input: unknown;
};

/**
 * Privileged tool calls the agent loop paused on (`toolApproval` in
 * main-agent.ts). The tool runs only after Approve; Reject sends the denial
 * back so the model can carry on without it.
 */
function pendingApprovals(messages: PlatformAgentUIMessage[]): PendingApproval[] {
  const out: PendingApproval[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") continue;
      const toolPart = part as {
        type: string;
        toolName?: string;
        state?: string;
        input?: unknown;
        approval?: { id: string; isAutomatic?: boolean };
      };
      if (toolPart.state !== "approval-requested" || !toolPart.approval) continue;
      if (toolPart.approval.isAutomatic) continue;
      out.push({
        approvalId: toolPart.approval.id,
        toolName: toolPart.toolName ?? toolPart.type.replace(/^tool-/, ""),
        input: toolPart.input,
      });
    }
  }
  return out;
}

/** One line naming what the tool is about to do, from its parsed input. */
function describeApprovalInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  return Object.entries(input as Record<string, unknown>)
    .filter(([, v]) => v != null && v !== "" && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
    .join(" · ");
}

function partText(message: PlatformAgentUIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

export function PlatformAgentConsole() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { toast } = useToast();
  const { setView, setActiveProjectId, activeProjectId } = useUI();
  const { data: session } = useSession();
  const isAdmin =
    session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN";
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const [interim, setInterim] = useState("");
  const [followView, setFollowView] = useState<DashboardView | null>(null);
  const [liveConfig, setLiveConfig] = useState<VoiceLiveConfigResponse | null>(
    null
  );
  // Chat by default: a first-time visitor used to land in Live with the text
  // box disabled and a "disconnected — press Connect" status under copy that
  // said "speak or type". Live is restored only for someone who connected it
  // before (persisted below).
  const [mode, setMode] = useState<"live" | "classic">("classic");
  const chooseMode = useCallback((next: "live" | "classic") => {
    setMode(next);
    browserStorage()?.setItem(MODE_STORAGE_KEY, next);
  }, []);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [missionCreating, setMissionCreating] = useState(false);
  const [missionRetryKey, setMissionRetryKey] = useState(0);
  const [attachments, setAttachments] = useState<
    Array<{
      id: string;
      originalName: string;
      docCategory: string;
      confidence: number;
      routeStatus: string;
      source: string;
      reasons?: string[];
      clarifyingQuestion?: string | null;
      runPipeline?: boolean;
      createProject?: boolean;
    }>
  >([]);
  const [feedItems, setFeedItems] = useState<MissionFeedItem[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const appliedToolKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/platform-agent/realtime/setup")
      .then((r) => r.json())
      .then((data: VoiceLiveConfigResponse) => {
        if (cancelled) return;
        setLiveConfig(data);
        setMode(
          data.enabled && browserStorage()?.getItem(MODE_STORAGE_KEY) === "live"
            ? "live"
            : "classic"
        );
      })
      .catch(() => {
        if (!cancelled) {
          setLiveConfig({
            enabled: false,
            reason: "Could not load live voice config",
          });
          setMode("classic");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<PlatformAgentUIMessage>({
        api: "/api/platform-agent/chat",
        body: {
          missionId,
          activeProjectId,
          locale,
        },
      }),
    [missionId, activeProjectId, locale]
  );

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    setMessages,
    addToolApprovalResponse,
  } = useChat<PlatformAgentUIMessage>({
    transport,
    onError: (err) => console.error("[platform-agent]", err),
    // After the person answers every pending approval, the turn resumes on its
    // own: approved tools run, denied ones are reported back to the model.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const approvals = useMemo(() => pendingApprovals(messages), [messages]);
  const errorCode = error ? sdkErrorCode(error) : null;

  useEffect(() => {
    let cancelled = false;
    const defaultError = ar
      ? "تعذّر بدء المهمة. أعد المحاولة."
      : "Could not start the mission. Please retry.";

    async function createMission() {
      setMissionCreating(true);
      setMissionError(null);
      try {
        const res = await fetch("/api/platform-agent/missions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activeProjectId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(apiErrorText(data, locale, defaultError));
        }
        if (!data?.mission?.id) {
          throw new Error(defaultError);
        }
        if (cancelled) return;
        setMissionId(data.mission.id);
        setMissionError(null);
        setAttachments(
          (data.mission.attachments ?? []).map(
            (row: {
              id: string;
              originalName: string;
              docCategory: string;
              confidence: number;
              routeStatus: string;
              source: string;
              classificationJson?: string | null;
            }) => {
              let reasons: string[] | undefined;
              let clarifyingQuestion: string | null | undefined;
              let runPipeline: boolean | undefined;
              let createProject: boolean | undefined;
              if (row.classificationJson) {
                try {
                  const parsed = JSON.parse(row.classificationJson) as {
                    reasons?: string[];
                    clarifyingQuestion?: string | null;
                    runPipeline?: boolean;
                    createProject?: boolean;
                  };
                  reasons = parsed.reasons;
                  clarifyingQuestion = parsed.clarifyingQuestion;
                  runPipeline = parsed.runPipeline;
                  createProject = parsed.createProject;
                } catch {
                  /* ignore malformed classification snapshots */
                }
              }
              return {
                id: row.id,
                originalName: row.originalName,
                docCategory: row.docCategory,
                confidence: row.confidence,
                routeStatus: row.routeStatus,
                source: row.source,
                reasons,
                clarifyingQuestion,
                runPipeline,
                createProject,
              };
            }
          )
        );
        setFeedItems(
          (data.mission.actions ?? []).map(
            (a: {
              id: string;
              toolName: string;
              status: string;
              outputJson?: string | null;
              createdAt?: string;
            }) => ({
              id: a.id,
              toolName: a.toolName,
              status: a.status,
              summary: summarizeStoredOutput(a.outputJson, ar),
              at: a.createdAt,
            })
          )
        );
        const rows = Array.isArray(data.mission.messages)
          ? data.mission.messages
          : [];
        if (rows.length > 0) {
          const hydrated = rows
            .map(
              (row: {
                id: string;
                role: string;
                partsJson: string;
              }) => {
                try {
                  const parsed = JSON.parse(row.partsJson) as {
                    id?: string;
                    parts?: PlatformAgentUIMessage["parts"];
                  };
                  const role =
                    row.role === "assistant" || row.role === "system"
                      ? row.role
                      : "user";
                  return {
                    id: parsed.id || row.id,
                    role,
                    parts:
                      Array.isArray(parsed.parts) && parsed.parts.length > 0
                        ? parsed.parts
                        : [{ type: "text" as const, text: "" }],
                  } satisfies PlatformAgentUIMessage;
                } catch {
                  return {
                    id: row.id,
                    role: (row.role === "assistant" ? "assistant" : "user") as
                      | "assistant"
                      | "user",
                    parts: [
                      {
                        type: "text" as const,
                        text: row.partsJson.slice(0, 4000),
                      },
                    ],
                  } satisfies PlatformAgentUIMessage;
                }
              }
            )
            .filter(Boolean);
          setMessages(hydrated);
        } else {
          setMessages([]);
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error && err.message ? err.message : defaultError;
        setMissionId(null);
        setMissionError(message);
        toast({
          title: ar ? "فشل تجهيز المهمة" : "Mission setup failed",
          description: message,
          variant: "destructive",
          duration: 4000,
        });
      } finally {
        if (!cancelled) setMissionCreating(false);
      }
    }

    void createMission();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, ar, missionRetryKey, setMessages, toast]);

  const busy = status === "submitted" || status === "streaming";

  const theaterTools = useMemo(() => {
    const fromMessages = extractTheaterTools(
      messages as Array<{
        id: string;
        role: string;
        parts: Array<{
          type: string;
          toolCallId?: string;
          toolName?: string;
          state?: string;
          input?: unknown;
          output?: unknown;
          errorText?: string;
          preliminary?: boolean;
        }>;
      }>
    );
    const fromFeed = feedItems.map((f) => ({
      id: `feed-${f.id}`,
      name: f.toolName,
      state: f.status,
      output: f.summary ? { message: f.summary } : undefined,
      messageId: f.id,
    }));
    const seen = new Set(fromMessages.map((t) => t.id));
    return [...fromMessages, ...fromFeed.filter((f) => !seen.has(f.id))];
  }, [messages, feedItems]);

  const performing =
    busy ||
    listening ||
    theaterTools.some(
      (t) => isToolRunning(t.state) || Boolean("preliminary" in t && t.preliminary)
    );

  /**
   * In live mode the work happens on a socket this component never sees, so it
   * has no truthful view of the transport or of what the agent is running.
   * `LiveVoiceSession` reports both up rather than restating them next to
   * indicators that disagree with it.
   */
  const [liveState, setLiveState] = useState<{
    transport: LiveTransport;
    tools: TheaterToolEvent[];
    performing: boolean;
  }>({ transport: "disconnected", tools: [], performing: false });

  const liveMode = mode === "live" && Boolean(liveConfig?.enabled);
  useEffect(() => {
    // Connecting Live once is the signal that this person wants to land in it.
    if (liveMode && liveState.transport === "connected") {
      browserStorage()?.setItem(MODE_STORAGE_KEY, "live");
    }
  }, [liveMode, liveState.transport]);
  const agentStatus = resolveAgentStatus({
    live: liveMode,
    liveTransport: liveState.transport,
    performing: liveMode ? liveState.performing : performing,
  });

  const processing = useCopilotProcessing({
    chatStatus: status,
    error,
    messages: messages as Array<{
      id: string;
      role: string;
      parts: Array<{ type: string; text?: string }>;
    }>,
    tools: theaterTools.map((t) => ({
      name: t.name,
      state: t.state,
      preliminary: "preliminary" in t ? Boolean(t.preliminary) : undefined,
    })),
    missionId,
    stop,
    retryLast: async (text) => {
      await sendMessage({ text });
    },
  });

  // Live UI follow-along from tool outputs
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") {
          continue;
        }
        const toolPart = part as {
          type: string;
          toolCallId?: string;
          state?: string;
          output?: Record<string, unknown>;
        };
        if (toolPart.state !== "output-available" || !toolPart.output) continue;
        const key = `${message.id}:${toolPart.toolCallId ?? toolPart.type}`;
        if (appliedToolKeys.current.has(key)) continue;
        appliedToolKeys.current.add(key);

        const out = toolPart.output;
        if (typeof out.projectId === "string" && out.projectId) {
          setActiveProjectId(out.projectId);
        }
        if (out.uiAction === "navigate" && typeof out.view === "string") {
          const view = out.view as DashboardView;
          // The console is the overview screen, so a tool pointing back at it
          // is telling the reader to stay put, not to navigate.
          setFollowView(view === "overview" ? null : view);
        }
        setFeedItems((prev) =>
          [
            {
              id: key,
              toolName: toolPart.type.replace(/^tool-/, ""),
              status: toolPart.state || "output-available",
              summary: summarizeToolOutput(out, ar),
            },
            ...prev,
          ].slice(0, 40)
        );
      }
    }
  }, [ar, messages, setActiveProjectId]);

  useEffect(() => {
    if (!voiceOut || typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }
    if (busy) return;
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    const text = partText(last);
    if (!text || spokenIdsRef.current.has(last.id)) return;
    spokenIdsRef.current.add(last.id);
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.slice(0, 1200));
    utter.lang = ar ? "ar-SA" : "en-US";
    utter.rate = 1.02;
    window.speechSynthesis.speak(utter);
  }, [messages, voiceOut, busy, ar]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const cancelListening = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  const stopMissionRun = useCallback(() => {
    cancelListening();
    window.speechSynthesis?.cancel();
    stop();
    toast({
      title: ar ? "تم الإيقاف" : "Stopped",
      description: ar
        ? "تم إيقاف الصوت والرد الجاري."
        : "Voice input, speech output, and the running response were stopped.",
      duration: 2500,
    });
  }, [ar, cancelListening, stop, toast]);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast({
        title: ar ? "الإدخال الصوتي غير متاح" : "Voice input unavailable",
        description: ar
          ? "المتصفح لا يدعم التعرف على الصوت. استخدم الإدخال النصي."
          : "Speech recognition is not supported in this browser. Use text input.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }
    window.speechSynthesis?.cancel();
    const rec = new Ctor();
    rec.lang = ar ? "ar-SA" : "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText.trim()) {
        setInterim("");
        setInput((prev) => (prev ? `${prev} ${finalText.trim()}` : finalText.trim()));
      }
    };
    rec.onerror = () => stopListening();
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [ar, stopListening, toast]);

  const submit = useCallback(async () => {
    const text = (input || interim).trim();
    if (!text || busy) return;
    stopListening();
    setInput("");
    setInterim("");
    // A typed or dictated message is a chat turn; the reply lands on the chat
    // stage, so the console follows it there.
    if (liveMode) chooseMode("classic");
    await sendMessage({ text });
  }, [input, interim, busy, sendMessage, stopListening, liveMode, chooseMode]);

  // "Run the agents" is refused server-side until onboarding is complete, so
  // the starter says so instead of inviting a click that answers 403.
  const [readiness, setReadiness] = useState<MissionReadiness | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { readyForProposals?: boolean } | null) => {
        if (!cancelled && data && typeof data.readyForProposals === "boolean") {
          setReadiness({ readyForProposals: data.readyForProposals });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const starters = useMemo(
    () => resolveMissionStarters(locale, readiness),
    [locale, readiness]
  );

  const sendStarter = useCallback(
    (command: string) => {
      if (busy || !missionId) return;
      stopListening();
      void sendMessage({ text: command });
    },
    [busy, missionId, sendMessage, stopListening]
  );

  const speakAndSend = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      startListening();
      return;
    }
    window.speechSynthesis?.cancel();
    const rec = new Ctor();
    rec.lang = ar ? "ar-SA" : "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText.trim()) {
        setInterim("");
        void sendMessage({ text: finalText.trim() });
      }
    };
    rec.onerror = () => stopListening();
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [ar, sendMessage, startListening, stopListening]);

  return (
    <MissionControlShell
      locale={locale}
      title={ar ? "الوكيل" : "Agent"}
      subtitle={
        ar
          ? "تحدّث أو اكتب — الوكيل ينفّذ أدوات المنصة ويعرض كل خطوة بوضوح."
          : "Speak or type — the agent runs platform tools and shows every step clearly."
      }
      mode={mode}
      onModeChange={chooseMode}
      liveEnabled={Boolean(liveConfig?.enabled)}
      liveHint={
        liveConfig && !liveConfig.enabled ? liveConfig.reason : null
      }
      liveModelLabel={
        liveConfig?.enabled ? providerDisplayName(liveConfig.provider) : null
      }
      liveModelDetail={liveConfig?.enabled ? liveConfig.modelId : null}
      status={agentStatus}
      pipelineTools={liveMode ? liveState.tools : theaterTools}
      kitMeta={{ files: attachments.length }}
      statusBadges={
        <div className="flex flex-wrap items-center gap-1.5">
          {followView ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-full gap-1 text-[11px]"
              onClick={() => startTransition(() => setView(followView))}
            >
              <span className="size-1.5 rounded-full bg-teal-500 animate-pulse" />
              {ar ? "عرض:" : "View:"} {viewLabel(followView, locale)}
            </Button>
          ) : null}
          {/*
            No "Live exec" badge: the header pill already says Working. The mic
            chip stays — a hot microphone should not be inferable only from a
            busier word somewhere else on the screen.
          */}
          {!liveMode && listening ? (
            <Badge variant="destructive" className="rounded-full gap-1 animate-pulse text-[10px]">
              <Mic className="size-3" />
              {ar ? "الميكروفون مفتوح" : "Mic live"}
            </Badge>
          ) : null}
        </div>
      }
      kit={
        <>
          <MissionAttachmentTray
            locale={locale}
            missionId={missionId}
            activeProjectId={activeProjectId}
            attachments={attachments}
            onUploaded={(payload) => {
              const data = payload as {
                attachment?: {
                  id: string;
                  originalName: string;
                  docCategory: string;
                  confidence: number;
                  routeStatus: string;
                  source: string;
                };
                autopilot?: {
                  mode?: string;
                  projectId?: string;
                  runId?: string;
                  message?: string;
                  question?: string;
                };
                decision?: {
                  category?: string;
                  confidence?: number;
                  reasons?: string[];
                  clarifyingQuestion?: string | null;
                  runPipeline?: boolean;
                  createProject?: boolean;
                };
              };
              if (data.attachment) {
                setAttachments((prev) =>
                  [
                    {
                      ...data.attachment!,
                      reasons: data.decision?.reasons,
                      clarifyingQuestion: data.decision?.clarifyingQuestion,
                      runPipeline: data.decision?.runPipeline,
                      createProject: data.decision?.createProject,
                    },
                    ...prev,
                  ].slice(0, 40)
                );
              }
              if (data.autopilot?.projectId) {
                setActiveProjectId(data.autopilot.projectId);
              }
              if (data.autopilot?.mode === "autopilot") {
                setFollowView("agents");
              }
              setFeedItems((prev) =>
                [
                  {
                    id: `upload-${crypto.randomUUID()}`,
                    toolName: "stageMissionAttachment",
                    status: "SUCCEEDED",
                    summary:
                      data.autopilot?.message ||
                      data.autopilot?.question ||
                      `${data.decision?.category ?? "file"} · ${Math.round((data.decision?.confidence ?? 0) * 100)}%`,
                  },
                  ...prev,
                ].slice(0, 40)
              );
            }}
            onUndo={() => {
              void sendMessage({
                text: ar
                  ? "تراجع عن آخر توجيه للملف"
                  : "Undo the last file routing action",
              });
            }}
          />
          <MissionExtensionBridge
            locale={locale}
            presentation="quiet"
            onExtensionEvent={(payload) => {
              const data = payload as {
                attachment?: {
                  id: string;
                  originalName: string;
                  docCategory: string;
                  confidence: number;
                  routeStatus: string;
                  source: string;
                };
                autopilot?: {
                  mode?: string;
                  projectId?: string;
                  message?: string;
                  question?: string;
                };
                decision?: {
                  category?: string;
                  confidence?: number;
                  reasons?: string[];
                  clarifyingQuestion?: string | null;
                  runPipeline?: boolean;
                  createProject?: boolean;
                };
                message?: string;
              };
              if (data.attachment) {
                setAttachments((prev) =>
                  [
                    {
                      ...data.attachment!,
                      reasons: data.decision?.reasons,
                      clarifyingQuestion: data.decision?.clarifyingQuestion,
                      runPipeline: data.decision?.runPipeline,
                      createProject: data.decision?.createProject,
                    },
                    ...prev,
                  ].slice(0, 40)
                );
              }
              if (data.autopilot?.projectId) {
                setActiveProjectId(data.autopilot.projectId);
              }
              setFeedItems((prev) =>
                [
                  {
                    id: `ext-${crypto.randomUUID()}`,
                    toolName: "chromeExtensionIngest",
                    status: "SUCCEEDED",
                    summary:
                      data.message ||
                      data.autopilot?.message ||
                      data.autopilot?.question ||
                      `${data.decision?.category ?? "browser"} capture`,
                  },
                  ...prev,
                ].slice(0, 40)
              );
            }}
          />
          <MissionPulseWidget
            locale={locale}
            missionId={missionId}
            refreshKey={feedItems.length}
          />
        </>
      }
      composer={
        // In Live the socket's own box takes over once connected; until then
        // the text box stays here, enabled, and typing switches to Chat.
        liveMode && liveState.transport === "connected" ? undefined : (
          <div className="flex w-full min-w-0 max-w-full flex-col gap-2.5">
            {approvals.map((approval) => (
              <div
                key={approval.approvalId}
                className="flex flex-wrap items-center gap-2 rounded-[12px] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-100"
                role="group"
                aria-label={ar ? "طلب موافقة" : "Approval request"}
                data-testid="tool-approval-request"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">
                    {ar ? "يطلب الوكيل موافقتك: " : "The agent asks your approval: "}
                    {humanActionLabel(approval.toolName, ar)}
                  </span>
                  {describeApprovalInput(approval.input) ? (
                    <span className="block truncate font-mono text-[11px] opacity-80">
                      {describeApprovalInput(approval.input)}
                    </span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 rounded-full text-[11px]"
                  onClick={() =>
                    addToolApprovalResponse({ id: approval.approvalId, approved: true })
                  }
                >
                  {ar ? "موافقة" : "Approve"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full text-[11px]"
                  onClick={() =>
                    addToolApprovalResponse({ id: approval.approvalId, approved: false })
                  }
                >
                  {ar ? "رفض" : "Reject"}
                </Button>
              </div>
            ))}
            {error ? (
              <div
                className="flex flex-wrap items-center gap-2 rounded-[12px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-300"
                role="alert"
                aria-live="assertive"
              >
                <span className="min-w-0 flex-1">{sdkErrorText(error, locale)}</span>
                {isAdmin && errorCode === "AI_PROVIDER_UNAVAILABLE" ? (
                  <Link
                    href="/app/admin/ai"
                    className="shrink-0 rounded-full border border-red-500/30 px-2.5 py-1 text-[11px] font-medium underline-offset-2 hover:underline"
                  >
                    {ar ? "فتح مزوّدي الذكاء الاصطناعي" : "Open AI providers"}
                  </Link>
                ) : null}
              </div>
            ) : null}
            {!missionId ? (
              // The retry control lives here, beside the message that asks for
              // it: in the collapsible kit panel it was hidden by default.
              <div
                className={cn(
                  "flex items-center gap-2 rounded-[12px] border px-3 py-2 text-[12px]",
                  missionError
                    ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
                    : "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                )}
                role={missionError ? "alert" : "status"}
              >
                {missionError ? (
                  <AlertCircle className="size-4 shrink-0" />
                ) : null}
                <span className="min-w-0 flex-1">
                  {missionCreating
                    ? ar
                      ? "جاري تجهيز المهمة…"
                      : "Getting the agent ready…"
                    : missionError
                      ? `${ar ? "تعذر بدء الوكيل." : "The agent could not start."} ${missionError}`
                      : ar
                        ? "انتظر حتى يصبح الوكيل جاهزاً قبل الإرسال."
                        : "Wait until the agent is ready before sending."}
                </span>
                {missionError && !missionCreating ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 rounded-full text-[11px]"
                    onClick={() => setMissionRetryKey((key) => key + 1)}
                  >
                    {ar ? "إعادة المحاولة" : "Try again"}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="relative">
              <Textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (liveMode && e.target.value) chooseMode("classic");
                }}
                placeholder={ar ? "اكتب أمراً… مثل: اعرض مشاريعي، أنشئ مناقصة، شغّل الوكلاء" : "Type a command… e.g. list projects, create a tender, run agents"}
                rows={2}
                className="min-h-[72px] sm:min-h-[76px] resize-none rounded-[14px] border-zinc-200/70 dark:border-white/10 bg-white/80 dark:bg-black/20 backdrop-blur text-[13px] sm:text-[14px] focus-visible:ring-teal-500/30 focus-visible:border-teal-500/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!missionId || busy) return;
                    void submit();
                  }
                }}
                disabled={busy || !missionId}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-teal-500/20 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button type="button" size="lg" className={cn("col-span-1 h-11 rounded-full text-[13px] gap-1.5 sm:min-w-[9.5rem]", listening && "animate-pulse shadow-[0_0_20px_-6px_rgba(20,184,166,0.5)]")} onClick={() => (listening ? stopMissionRun() : speakAndSend())} disabled={!missionId || (busy && !listening)}>
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                {listening ? (ar ? "إيقاف" : "Stop") : ar ? "تحدّث" : "Speak"}
              </Button>
              <Button type="button" variant="secondary" size="lg" onClick={() => void submit()} disabled={!missionId || busy || !input.trim()} className="col-span-1 h-11 rounded-full text-[13px] gap-1.5">
                <Send className="size-4" />
                {ar ? "إرسال" : "Send"}
              </Button>
              {busy ? (
                <Button type="button" variant="outline" onClick={stopMissionRun} className="col-span-2 sm:col-span-1 h-10 rounded-full gap-1.5 text-[12px]">
                  <Square className="size-4" />
                  {ar ? "إيقاف التنفيذ" : "Stop run"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="col-span-2 sm:col-span-1 sm:ms-auto h-9 rounded-full gap-1.5 text-[12px] px-3"
                onClick={() => {
                  setVoiceOut((v) => {
                    if (v) window.speechSynthesis?.cancel();
                    return !v;
                  });
                }}
              >
                {voiceOut ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                {voiceOut ? (ar ? "صوت الرد" : "Voice on") : ar ? "صامت" : "Muted"}
              </Button>
            </div>
          </div>
        )
      }
    >
      {mode === "live" && liveConfig?.enabled ? (
        <LiveVoiceSession
          config={liveConfig}
          missionId={missionId}
          activeProjectId={activeProjectId}
          externalFeed={feedItems}
          onStateChange={setLiveState}
        />
      ) : (
        <MissionPerformanceStage
          locale={locale}
          performing={performing}
          tools={theaterTools}
          className="flex-1 min-h-0"
        >
          <MissionStage
            locale={locale}
            tools={theaterTools}
            listening={listening}
            speaking={busy && voiceOut}
            thinking={busy}
            conversation={
              <MissionConversation
                locale={locale}
                messages={messages}
                interim={interim}
                performing={performing}
                assistantLabel={ar ? "الوكيل" : "Agent"}
                emptyHint={
                  ar
                    ? "اطلب بلغتك العادية — كل خطوة ينفّذها الوكيل تظهر في «المعاينات الحية»."
                    : "Ask in plain language — every step the agent takes appears under Live previews."
                }
                starters={starters}
                onStarter={sendStarter}
                startersDisabled={busy || !missionId}
                processingSlot={
                  <CopilotProcessingView
                    locale={locale}
                    snapshot={processing.snapshot}
                    streamPreview={processing.partialText}
                    restoredFromStorage={processing.restoredFromStorage}
                    online={processing.online}
                    onCancel={processing.onCancel}
                    onRetry={processing.onRetry}
                  />
                }
              />
            }
          />
        </MissionPerformanceStage>
      )}
    </MissionControlShell>
  );
}
