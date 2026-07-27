"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
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
import type { PlatformAgentUIMessage } from "@/lib/agents/platform/main-agent";
import type { VoiceLiveConfigResponse } from "@/lib/agents/platform/voice-types";
import { extractTheaterTools, isToolRunning } from "@/lib/agents/platform/mission-tool-parts";
import { LiveVoiceSession } from "./live-voice-session";
import { MissionAttachmentTray } from "./mission-attachment-tray";
import type { MissionFeedItem } from "./mission-execution-feed";
import { MissionPerformanceStage } from "./mission-performance-fx";
import { MissionExtensionBridge } from "./mission-extension-bridge";
import { MissionPulseWidget } from "./mission-pulse-widget";
import { MissionControlShell } from "./mission-control-shell";
import { MissionStage } from "./mission-stage";
import { MissionConversation } from "./mission-conversation";

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
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);
  const [interim, setInterim] = useState("");
  const [followView, setFollowView] = useState<DashboardView | null>(null);
  const [followNote, setFollowNote] = useState<string | null>(null);
  const [liveConfig, setLiveConfig] = useState<VoiceLiveConfigResponse | null>(
    null
  );
  const [mode, setMode] = useState<"live" | "classic">("live");
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
        setMode(data.enabled ? "live" : "classic");
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
        },
      }),
    [missionId, activeProjectId]
  );

  const { messages, sendMessage, status, stop, error, setMessages } =
    useChat<PlatformAgentUIMessage>({
      transport,
      onError: (err) => console.error("[platform-agent]", err),
    });

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
          throw new Error(
            typeof data?.error === "string" ? data.error : defaultError
          );
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
              summary: a.outputJson?.slice(0, 280),
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
          setFollowView(view === "copilot" ? null : view);
          setFollowNote(
            typeof out.reason === "string"
              ? out.reason
              : toolPart.type.replace(/^tool-/, "")
          );
        }
        if (out.uiAction === "setActiveProject") {
          setFollowNote("active project focused");
        }
        setFeedItems((prev) =>
          [
            {
              id: key,
              toolName: toolPart.type.replace(/^tool-/, ""),
              status: toolPart.state || "output-available",
              summary: JSON.stringify(out).slice(0, 280),
            },
            ...prev,
          ].slice(0, 40)
        );
      }
    }
  }, [messages, setActiveProjectId]);

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
    await sendMessage({ text });
  }, [input, interim, busy, sendMessage, stopListening]);

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
      title={ar ? "مركز قيادة الصوت" : "Voice Mission Control"}
      subtitle={
        ar
          ? "تحدّث أو اكتب — الوكيل ينفّذ أدوات المنصة ويعرض كل خطوة بوضوح."
          : "Speak or type — the agent runs platform tools and shows every step clearly."
      }
      mode={mode}
      onModeChange={setMode}
      liveEnabled={Boolean(liveConfig?.enabled)}
      liveHint={
        liveConfig && !liveConfig.enabled ? liveConfig.reason : null
      }
      liveModelLabel={
        liveConfig?.enabled
          ? `${liveConfig.provider} · ${liveConfig.modelId}`
          : null
      }
      performing={performing}
      pipelineTools={theaterTools}
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
              {ar ? "عرض:" : "View:"} {followView}
            </Button>
          ) : null}
          {mode !== "live" || !liveConfig?.enabled ? (
            <>
              {busy ? (
                <Badge className="rounded-full gap-1 border-teal-500/20 bg-teal-500/10 text-teal-800 dark:text-teal-200 animate-pulse text-[10px]">
                  <Loader2 className="size-3 animate-spin" />
                  {ar ? "ينفّذ مباشر" : "Live exec"}
                </Badge>
              ) : null}
              {listening ? (
                <Badge variant="destructive" className="rounded-full gap-1 animate-pulse text-[10px]">
                  <Mic className="size-3" />
                  {ar ? "يستمع" : "Listening"}
                </Badge>
              ) : null}
            </>
          ) : null}
          <Badge variant="outline" className="rounded-full text-[10px] border-zinc-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] px-2">
            {theaterTools.length} {ar ? "خطوات" : "steps"} · {theaterTools.filter((t: { state: string; preliminary?: boolean }) => isToolRunning(t.state) || (t as { preliminary?: boolean }).preliminary).length} {ar ? "حي" : "live"}
          </Badge>
        </div>
      }
      kit={
        <>
          {missionError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {ar ? "فشل تجهيز المهمة" : "Mission setup failed"}
                  </p>
                  <p className="mt-0.5 text-xs text-destructive/80">
                    {missionError}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setMissionRetryKey((key) => key + 1)}
                  disabled={missionCreating}
                >
                  {missionCreating ? (
                    <Loader2 className="size-3 me-1 animate-spin" />
                  ) : null}
                  {ar ? "إعادة المحاولة" : "Retry"}
                </Button>
              </div>
            </div>
          ) : null}
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
                setFollowNote(
                  data.autopilot.message || "autopilot pipeline started"
                );
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
        mode === "live" && liveConfig?.enabled ? undefined : (
          <div className="flex w-full min-w-0 max-w-full flex-col gap-2.5">
            {error ? (
              <div className="rounded-[12px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
                {error.message}
              </div>
            ) : null}
            {!missionId ? (
              <div
                className="rounded-[12px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200"
                role="status"
              >
                {missionCreating
                  ? ar
                    ? "جاري تجهيز المهمة…"
                    : "Preparing mission…"
                  : missionError
                    ? ar
                      ? "تعذر إنشاء المهمة — استخدم إعادة المحاولة أعلاه."
                      : "Mission create failed — use Retry above."
                    : ar
                      ? "انتظر حتى تصبح المهمة جاهزة قبل الإرسال."
                      : "Wait until the mission is ready before sending."}
              </div>
            ) : null}
            <div className="relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
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
                    ? "جرّب: «اعرض مشاريعي»، «أنشئ مناقصة»، «شغّل الوكلاء» — شريط الحالة ونشاط الأدوات يوضحان كل خطوة."
                    : "Try: “List my projects”, “Create a tender”, “Run the agents” — the status bar and activity pane show every step."
                }
              />
            }
          />
        </MissionPerformanceStage>
      )}
    </MissionControlShell>
  );
}
