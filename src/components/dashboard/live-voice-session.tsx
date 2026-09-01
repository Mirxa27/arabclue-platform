"use client";

import { apiErrorText, sdkErrorText } from "@/lib/api-failure-message";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { experimental_useRealtime } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
import { viewLabel } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Send,
  AudioLines,
  Wand2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VoiceLiveConfig } from "@/lib/agents/platform/voice-types";
import { RealtimeAudioWorkletCapture } from "@/lib/agents/platform/realtime-audio-capture";
import { getLiveVoiceSessionConfig } from "@/lib/agents/platform/realtime-session-config";
import {
  DEFAULT_STYLE,
  DEFAULT_VOICE,
  VOICE_STYLES,
  resolveVoice,
  voicesForProvider,
} from "@/lib/agents/platform/voice-options";
import {
  extractTheaterTools,
  isToolRunning,
  type MissionFeedItem,
  type TheaterToolEvent,
} from "@/lib/agents/platform/mission-tool-parts";
import type { LiveTransport } from "@/lib/agents/platform/agent-status";
import { useToast } from "@/hooks/use-toast";
import { MissionPerformanceStage } from "./mission-performance-fx";
import { MissionStage } from "./mission-stage";
import { MissionConversation } from "./mission-conversation";

function micErrorMessage(err: unknown, ar: boolean): string {
  if (!window.isSecureContext) {
    return ar
      ? "الميكروفون يتطلب HTTPS. افتح https://arabclue.com وأعد المحاولة."
      : "Microphone access requires HTTPS. Open https://arabclue.com and try again.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return ar
      ? "هذا المتصفح لا يدعم التقاط الميكروفون."
      : "This browser does not support microphone capture.";
  }
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return ar
      ? "تم رفض إذن الميكروفون. اسمح بالميكروفون لـ arabclue.com من إعدادات الموقع ثم أعد المحاولة."
      : "Microphone permission was denied. Allow the mic for arabclue.com in site settings, then retry.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return ar
      ? "لم يتم العثور على ميكروفون على هذا الجهاز."
      : "No microphone was found on this device.";
  }
  if (err instanceof Error && /Permissions policy|NotAllowedError/i.test(err.message)) {
    return ar
      ? "سياسة الصفحة تمنع الميكروفون. حدّث الصفحة بعد نشر الإعدادات الجديدة."
      : "This page's permissions policy blocks the microphone. Refresh after the latest deploy.";
  }
  return err instanceof Error
    ? err.message
    : ar
      ? "تعذّر الوصول إلى الميكروفون."
      : "Could not access the microphone.";
}

/** The socket handle itself, as opposed to `LiveTransport`, its state. */
type LiveTransportHandle = {
  connect: () => Promise<void>;
  disconnect: () => void;
  stopPlayback: () => void;
  sendTextMessage: (text: string) => void;
  sendAudio: (base64Audio: string) => void;
};

export function LiveVoiceSession({
  config,
  missionId,
  activeProjectId,
  externalFeed = [],
  onStateChange,
}: {
  config: VoiceLiveConfig;
  missionId?: string | null;
  activeProjectId?: string | null;
  externalFeed?: MissionFeedItem[];
  /**
   * The session owns the only truthful view of the transport and of what the
   * agent is running, and both are rendered above it — the header status pill
   * and the pipeline strip. Neither can see this component's state, so it
   * reports rather than restating them locally.
   */
  onStateChange?: (state: {
    transport: LiveTransport;
    tools: TheaterToolEvent[];
    performing: boolean;
  }) => void;
}) {
  const { locale } = useLocale();
  const { setView, setActiveProjectId } = useUI();
  const { toast } = useToast();
  const ar = locale === "ar";
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [followView, setFollowView] = useState<DashboardView | null>(null);
  const [starting, setStarting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const voiceOptions = useMemo(
    () => voicesForProvider(config.provider),
    [config.provider]
  );
  const [voice, setVoice] = useState<string>(
    () => DEFAULT_VOICE[config.provider]
  );
  const [style, setStyle] = useState<string>(DEFAULT_STYLE);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<RealtimeAudioWorkletCapture | null>(null);
  const appliedToolKeys = useRef<Set<string>>(new Set());
  const transportRef = useRef<LiveTransportHandle | null>(null);
  const setActiveProjectIdRef = useRef(setActiveProjectId);
  const setFollowViewRef = useRef(setFollowView);
  const missionIdRef = useRef(missionId ?? null);
  const activeProjectIdRef = useRef(activeProjectId ?? null);

  useEffect(() => {
    setActiveProjectIdRef.current = setActiveProjectId;
    setFollowViewRef.current = setFollowView;
  });
  useEffect(() => {
    missionIdRef.current = missionId ?? null;
  }, [missionId]);
  useEffect(() => {
    activeProjectIdRef.current = activeProjectId ?? null;
  }, [activeProjectId]);

  const model = useMemo(() => {
    if (config.provider === "google") {
      return createGoogleGenerativeAI().experimental_realtime(config.modelId);
    }
    return createOpenAI().experimental_realtime(config.modelId);
  }, [config.provider, config.modelId]);
  const resolvedVoice = resolveVoice(config.provider, voice);
  const sessionConfig = useMemo(
    () => getLiveVoiceSessionConfig(resolvedVoice),
    [resolvedVoice]
  );
  // Style shapes server-side instructions; voice is also passed so the minted
  // token and the client session-update agree.
  const tokenUrl = useMemo(
    () =>
      `/api/platform-agent/realtime/setup?voice=${encodeURIComponent(
        resolvedVoice
      )}&style=${encodeURIComponent(style)}`,
    [resolvedVoice, style]
  );

  const realtime = experimental_useRealtime({
    model,
    api: { token: tokenUrl },
    sessionConfig,
    onError: (err) => {
      // The transport throws the raw response text; the mapped body carries the
      // reader's language, so keep the raw reason in the console only.
      console.error("[live-voice]", err);
      setError(
        sdkErrorText(
          err,
          locale,
          ar
            ? "تعذّر تشغيل الجلسة الصوتية المباشرة"
            : "The live voice session could not run"
        )
      );
    },
    onToolCall: async ({ toolCall }) => {
      const res = await fetch("/api/platform-agent/realtime/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: toolCall.toolName,
          args: toolCall.args,
          missionId: missionIdRef.current,
          activeProjectId: activeProjectIdRef.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: apiErrorText(data, locale, "Tool failed") };
      }
      const result = data.result as Record<string, unknown> | undefined;
      if (result && typeof result === "object") {
        if (typeof result.projectId === "string" && result.projectId) {
          setActiveProjectIdRef.current(result.projectId);
        }
        if (result.uiAction === "navigate" && typeof result.view === "string") {
          const view = result.view as DashboardView;
          setFollowViewRef.current(view === "overview" ? null : view);
        }
      }
      return data.result;
    },
  });

  transportRef.current = {
    connect: realtime.connect,
    disconnect: realtime.disconnect,
    stopPlayback: realtime.stopPlayback,
    sendTextMessage: realtime.sendTextMessage,
    sendAudio: realtime.sendAudio,
  };

  // Apply tool UI follow-alongs from streamed messages
  useEffect(() => {
    for (const message of realtime.messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (!part.type.startsWith("tool-")) continue;
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
          setActiveProjectIdRef.current(out.projectId);
        }
        if (out.uiAction === "navigate" && typeof out.view === "string") {
          const view = out.view as DashboardView;
          setFollowViewRef.current(view === "overview" ? null : view);
        }
      }
    }
  }, [realtime.messages]);

  const stopCapture = useCallback(async () => {
    const capture = captureRef.current;
    captureRef.current = null;
    if (capture) {
      await capture.stop();
    }
    setIsCapturing(false);
  }, []);

  const releaseMic = useCallback(async () => {
    await stopCapture();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopCapture]);

  const startCapture = useCallback(async (stream: MediaStream) => {
    const capture = new RealtimeAudioWorkletCapture({
      targetSampleRate: 24_000,
      onAudio: (base64) => {
        transportRef.current?.sendAudio(base64);
      },
    });
    captureRef.current = capture;
    await capture.start(stream);
    setIsCapturing(true);
  }, []);

  const stopLive = useCallback(() => {
    const transport = transportRef.current;
    void releaseMic();
    try {
      transport?.stopPlayback();
    } catch {
      /* ignore */
    }
    try {
      transport?.disconnect();
    } catch {
      /* ignore */
    }
    setStarting(false);
    toast({
      title: ar ? "تم الإيقاف" : "Stopped",
      description: ar
        ? "تم إنهاء المكالمة وإيقاف الصوت."
        : "Live call and audio playback were stopped.",
      duration: 2500,
    });
  }, [ar, releaseMic, toast]);

  // Tear down only on unmount — never when connect/disconnect identities change.
  useEffect(() => {
    return () => {
      const capture = captureRef.current;
      captureRef.current = null;
      void capture?.stop();
      const transport = transportRef.current;
      try {
        transport?.stopPlayback();
      } catch {
        /* ignore */
      }
      try {
        transport?.disconnect();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const startLive = useCallback(async () => {
    if (starting || realtime.status === "connecting" || realtime.status === "connected") {
      return;
    }
    setError(null);
    setStarting(true);

    let stream: MediaStream | null = null;
    try {
      // Mic first — avoid opening a WebSocket we immediately abandon on permission denial.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (micErr) {
        throw new Error(micErrorMessage(micErr, ar));
      }

      streamRef.current = stream;
      await transportRef.current?.connect();
      // Use AudioWorklet capture (not AI SDK ScriptProcessorNode) to avoid deprecation warnings.
      await startCapture(stream);
    } catch (err) {
      await releaseMic();
      try {
        transportRef.current?.disconnect();
      } catch {
        /* ignore partial connect */
      }
      setError(
        sdkErrorText(
          err,
          locale,
          // Mic failures already arrive localized from micErrorMessage.
          err instanceof Error && err.message
            ? err.message
            : ar
              ? "فشل بدء الصوت المباشر"
              : "Failed to start live voice"
        )
      );
    } finally {
      setStarting(false);
    }
  }, [ar, releaseMic, realtime.status, startCapture, starting]);

  const connected = realtime.status === "connected";
  const connecting = realtime.status === "connecting" || starting;

  const theaterTools = useMemo(() => {
    const fromMessages = extractTheaterTools(
      realtime.messages as Array<{
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
    const fromFeed = externalFeed.map((f) => ({
      id: `feed-${f.id}`,
      name: f.toolName,
      state: f.status,
      output: f.summary ? { message: f.summary } : undefined,
      messageId: f.id,
    }));
    const seen = new Set(fromMessages.map((t) => t.id));
    return [...fromMessages, ...fromFeed.filter((f) => !seen.has(f.id))];
  }, [realtime.messages, externalFeed]);

  const performing =
    connected &&
    (isCapturing ||
      realtime.isPlaying ||
      theaterTools.some(
        (t) => isToolRunning(t.state) || Boolean("preliminary" in t && t.preliminary)
      ) ||
      connecting);

  const transport: LiveTransport = connected
    ? "connected"
    : connecting
      ? "connecting"
      : "disconnected";

  useEffect(() => {
    onStateChange?.({ transport, tools: theaterTools, performing });
  }, [onStateChange, transport, theaterTools, performing]);

  return (
    <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-3" dir={ar ? "rtl" : "ltr"}>
      {/*
        No connection badge and no "Speaking…" badge here. The header pill owns
        the status and the ticker directly below owns the phase; this row used
        to disagree with both. The live-mic chip stays regardless of phase —
        a hot microphone is not something to hide behind a busier label.
      */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2 empty:hidden">
        {isCapturing ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300">
            <Mic className="size-3" />
            {ar ? "الميكروفون مفتوح" : "Mic live"}
          </span>
        ) : null}
        {followView ? (
          <Button type="button" size="sm" variant="outline" className="h-7 rounded-full text-[11px]" onClick={() => setView(followView)}>
            {ar ? "افتح:" : "Open:"} {viewLabel(followView, locale)}
          </Button>
        ) : null}
      </div>

      <MissionPerformanceStage
        locale={locale}
        performing={performing}
        tools={theaterTools}
        className="min-h-0 flex-1"
      >
        <MissionStage
          locale={locale}
          tools={theaterTools}
          voiceLive
          listening={isCapturing}
          speaking={realtime.isPlaying}
          thinking={connecting}
          offline={transport === "disconnected"}
          conversation={
            <MissionConversation
              locale={locale}
              messages={realtime.messages}
              performing={performing}
              assistantLabel={ar ? "مباشر" : "Live"}
              emptyHint={
                ar
                  ? "اضغط اتصال مباشر ثم تحدّث — الوكيل ينفّذ الأدوات ويعرض كل خطوة في لوحة النشاط."
                  : "Tap Connect live, then speak — the agent runs tools and shows each step in the activity pane."
              }
            />
          }
        />
      </MissionPerformanceStage>

      {(error || realtime.status === "error") && (
        <div className="rounded-[12px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
          {error || (ar ? "خطأ في الجلسة المباشرة" : "Live session error")}
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-2.5 rounded-[16px] border border-zinc-200/70 dark:border-white/[0.08] bg-white/[0.72] dark:bg-zinc-900/60 backdrop-blur-xl p-3 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <AudioLines className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {ar ? "الصوت" : "Voice"}
            </span>
            <Select value={voice} onValueChange={setVoice} disabled={connected}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {voiceOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    <span className="font-medium">{v.label}</span>
                    {v.note ? (
                      <span className="ms-1.5 text-[10px] text-muted-foreground">
                        {ar ? v.noteAr ?? v.note : v.note}
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <Wand2 className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {ar ? "الأسلوب" : "Style"}
            </span>
            <Select value={style} onValueChange={setStyle} disabled={connected}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_STYLES.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {ar ? s.labelAr : s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {connected ? (
            <span className="text-[10px] text-muted-foreground">
              {ar
                ? "أعد الاتصال لتغيير الصوت/الأسلوب"
                : "Reconnect to change voice/style"}
            </span>
          ) : null}
        </div>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          className="min-h-[64px] resize-none"
          placeholder={
            ar
              ? "اكتب رسالة أثناء الجلسة المباشرة…"
              : "Type during the live session…"
          }
          disabled={!connected}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (input.trim() && connected) {
                transportRef.current?.sendTextMessage(input.trim());
                setInput("");
              }
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button
              type="button"
              size="lg"
              className="min-w-[10rem]"
              onClick={() => void startLive()}
              disabled={connecting}
            >
              {connecting ? (
                <Loader2 className="size-4 me-2 animate-spin" />
              ) : (
                <Phone className="size-4 me-2" />
              )}
              {ar ? "اتصال مباشر" : "Connect live"}
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              variant="destructive"
              className="min-w-[10rem]"
              onClick={stopLive}
            >
              <PhoneOff className="size-4 me-2" />
              {ar ? "إنهاء المكالمة" : "End call"}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={!connected || !input.trim()}
            onClick={() => {
              if (!input.trim() || !connected) return;
              transportRef.current?.sendTextMessage(input.trim());
              setInput("");
            }}
          >
            <Send className="size-4 me-2" />
            {ar ? "إرسال" : "Send"}
          </Button>
          {connected ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void (async () => {
                  if (isCapturing) {
                    await stopCapture();
                  } else if (streamRef.current) {
                    await startCapture(streamRef.current);
                  }
                })();
              }}
            >
              {isCapturing ? (
                <MicOff className="size-4 me-2" />
              ) : (
                <Mic className="size-4 me-2" />
              )}
              {isCapturing
                ? ar
                  ? "كتم الميكروفون"
                  : "Mute mic"
                : ar
                  ? "تفعيل الميكروفون"
                  : "Unmute mic"}
            </Button>
          ) : null}
        </div>
        {/* Connection/provider provenance lives on the header chip's tooltip. */}
      </div>
    </div>
  );
}
