"use client";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { experimental_useRealtime } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Radio,
  Send,
} from "lucide-react";
import type { VoiceLiveConfig } from "@/lib/agents/platform/voice-types";
import { RealtimeAudioWorkletCapture } from "@/lib/agents/platform/realtime-audio-capture";
import { getLiveVoiceSessionConfig } from "@/lib/agents/platform/realtime-session-config";
import { extractTheaterTools, isToolRunning } from "@/lib/agents/platform/mission-tool-parts";
import { MissionToolTheater } from "./mission-tool-theater";
import { MissionPerformanceStage } from "./mission-performance-fx";
import type { MissionFeedItem } from "./mission-execution-feed";

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

type LiveTransport = {
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
}: {
  config: VoiceLiveConfig;
  missionId?: string | null;
  activeProjectId?: string | null;
  externalFeed?: MissionFeedItem[];
}) {
  const { locale } = useLocale();
  const { setView, setActiveProjectId } = useUI();
  const ar = locale === "ar";
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [followView, setFollowView] = useState<DashboardView | null>(null);
  const [starting, setStarting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<RealtimeAudioWorkletCapture | null>(null);
  const appliedToolKeys = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<LiveTransport | null>(null);
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
  const sessionConfig = getLiveVoiceSessionConfig();

  const realtime = experimental_useRealtime({
    model,
    api: { token: "/api/platform-agent/realtime/setup" },
    sessionConfig,
    onError: (err) => setError(err.message),
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
        return { ok: false, error: data.error || "Tool failed" };
      }
      const result = data.result as Record<string, unknown> | undefined;
      if (result && typeof result === "object") {
        if (typeof result.projectId === "string" && result.projectId) {
          setActiveProjectIdRef.current(result.projectId);
        }
        if (result.uiAction === "navigate" && typeof result.view === "string") {
          const view = result.view as DashboardView;
          setFollowViewRef.current(view === "copilot" ? null : view);
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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [realtime.messages, realtime.status]);

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
          setFollowViewRef.current(view === "copilot" ? null : view);
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
  }, [releaseMic]);

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
        err instanceof Error
          ? err.message
          : ar
            ? "فشل بدء الصوت المباشر"
            : "Failed to start live voice"
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

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0" dir={ar ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <Radio className="size-3" />
          {config.provider === "google" ? "Gemini Live" : "OpenAI Realtime"}
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px]">
          {config.modelId}
        </Badge>
        <Badge
          className={cn(
            connected && "bg-emerald-600",
            connecting && "animate-pulse"
          )}
        >
          {starting && realtime.status === "disconnected"
            ? ar
              ? "يجهّز…"
              : "starting"
            : realtime.status}
        </Badge>
        {isCapturing && (
          <Badge variant="destructive" className="gap-1 animate-pulse">
            <Mic className="size-3" />
            {ar ? "الميكروفون" : "Mic live"}
          </Badge>
        )}
        {realtime.isPlaying && (
          <Badge className="gap-1 bg-teal-700">
            {ar ? "يتحدث…" : "Speaking…"}
          </Badge>
        )}
        {followView && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setView(followView)}
          >
            {ar ? "عرض الشاشة:" : "Watch screen:"} {followView}
          </Button>
        )}
      </div>

      <MissionPerformanceStage
        locale={locale}
        performing={performing}
        tools={theaterTools}
        className="flex-1 min-h-0"
      >
      <div className="grid flex-1 min-h-0 gap-4 p-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-2xl border border-cyan-500/15 bg-gradient-to-b from-background/80 via-teal-500/[0.04] to-background/80 p-4 space-y-3 backdrop-blur-[2px]"
        >
          {realtime.messages.length === 0 && (
            <p className="text-sm text-muted-foreground max-w-xl">
              {ar
                ? "اضغط اتصال مباشر ثم تحدّث — المؤشر المتلألئ والمسرح يظهران كل أداة وتوليد المستندات بصرياً."
                : "Tap Connect live, then speak — the glitter cursor and theater visualize every tool and document forge beat-by-beat."}
            </p>
          )}
          {realtime.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "rounded-xl px-3 py-2 text-sm max-w-[94%]",
                message.role === "user"
                  ? "ms-auto bg-primary text-primary-foreground"
                  : "me-auto bg-card/90 border border-border/70",
                message.role === "assistant" &&
                  performing &&
                  "shadow-[0_0_24px_rgba(34,211,238,0.12)]"
              )}
            >
              <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
                {message.role === "user"
                  ? ar
                    ? "أنت"
                    : "You"
                  : ar
                    ? "مباشر"
                    : "Live"}
              </div>
              <div className="space-y-2 whitespace-pre-wrap">
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return <p key={i}>{part.text}</p>;
                  }
                  if (
                    part.type.startsWith("tool-") ||
                    part.type === "dynamic-tool"
                  ) {
                    const tp = part as {
                      type: string;
                      toolName?: string;
                      state?: string;
                    };
                    const name =
                      tp.type === "dynamic-tool"
                        ? tp.toolName || "tool"
                        : tp.type.replace(/^tool-/, "");
                    const live =
                      tp.state === "input-streaming" ||
                      tp.state === "input-available";
                    return (
                      <div
                        key={i}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/5 px-2 py-0.5 text-[10px] font-mono",
                          live && "mission-tool-live border-cyan-300/50"
                        )}
                      >
                        <span className="size-1.5 rounded-full bg-teal-500 animate-pulse" />
                        {name}
                        <span className="opacity-60">{tp.state}</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
        </div>

        <MissionToolTheater
          locale={locale}
          tools={theaterTools}
          voiceLive
          isCapturing={isCapturing}
          isSpeaking={realtime.isPlaying}
          className="overflow-y-auto"
        />
      </div>
      </MissionPerformanceStage>

      {(error || realtime.status === "error") && (
        <div className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2">
          {error || (ar ? "خطأ في الجلسة المباشرة" : "Live session error")}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder={
            ar
              ? "أو اكتب رسالة نصية أثناء الجلسة المباشرة…"
              : "Or type a text message during the live session…"
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
              onClick={stopLive}
            >
              <PhoneOff className="size-4 me-2" />
              {ar ? "إنهاء" : "End call"}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={!connected || !input.trim()}
            onClick={() => {
              if (!input.trim()) return;
              transportRef.current?.sendTextMessage(input.trim());
              setInput("");
            }}
          >
            <Send className="size-4 me-2" />
            {ar ? "إرسال نص" : "Send text"}
          </Button>
          {connected && (
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
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {config.connectionName} · {config.providerLabel}
        </p>
      </div>
    </div>
  );
}
