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
  Wrench,
} from "lucide-react";
import type { VoiceLiveConfig } from "@/lib/agents/platform/voice-types";

function partText(message: {
  parts: Array<{ type: string; text?: string }>;
}): string {
  return message.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n")
    .trim();
}

function toolLabel(type: string): string {
  return type.replace(/^tool-/, "").replace(/([A-Z])/g, " $1").trim();
}

export function LiveVoiceSession({ config }: { config: VoiceLiveConfig }) {
  const { locale } = useLocale();
  const { setView, setActiveProjectId } = useUI();
  const ar = locale === "ar";
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [followView, setFollowView] = useState<DashboardView | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const appliedToolKeys = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const model = useMemo(() => {
    if (config.provider === "google") {
      return createGoogleGenerativeAI().experimental_realtime(config.modelId);
    }
    return createOpenAI().experimental_realtime(config.modelId);
  }, [config.provider, config.modelId]);

  const realtime = experimental_useRealtime({
    model,
    api: { token: "/api/platform-agent/realtime/setup" },
    sessionConfig: {
      instructions: undefined,
      inputAudioTranscription: {},
      voice: "alloy",
      turnDetection: { type: "server-vad" },
    },
    onError: (err) => setError(err.message),
    onToolCall: async ({ toolCall }) => {
      const res = await fetch("/api/platform-agent/realtime/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: toolCall.toolName,
          args: toolCall.args,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || "Tool failed" };
      }
      const result = data.result as Record<string, unknown> | undefined;
      if (result && typeof result === "object") {
        if (typeof result.projectId === "string" && result.projectId) {
          setActiveProjectId(result.projectId);
        }
        if (result.uiAction === "navigate" && typeof result.view === "string") {
          const view = result.view as DashboardView;
          setFollowView(view === "copilot" ? null : view);
        }
      }
      return data.result;
    },
  });

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
          setActiveProjectId(out.projectId);
        }
        if (out.uiAction === "navigate" && typeof out.view === "string") {
          const view = out.view as DashboardView;
          setFollowView(view === "copilot" ? null : view);
        }
      }
    }
  }, [realtime.messages, setActiveProjectId]);

  const stopLive = useCallback(() => {
    realtime.stopAudioCapture();
    realtime.stopPlayback();
    realtime.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [realtime]);

  const startLive = useCallback(async () => {
    setError(null);
    try {
      await realtime.connect();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      realtime.startAudioCapture(stream);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start live voice");
      stopLive();
    }
  }, [realtime, stopLive]);

  useEffect(() => () => stopLive(), [stopLive]);

  const connected = realtime.status === "connected";
  const connecting = realtime.status === "connecting";

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
          {realtime.status}
        </Badge>
        {realtime.isCapturing && (
          <Badge variant="destructive" className="gap-1 animate-pulse">
            <Mic className="size-3" />
            {ar ? "الميكروفون" : "Mic live"}
          </Badge>
        )}
        {realtime.isPlaying && (
          <Badge className="gap-1">
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

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border bg-gradient-to-b from-background via-muted/20 to-background p-4 space-y-3"
      >
        {realtime.messages.length === 0 && (
          <p className="text-sm text-muted-foreground max-w-xl">
            {ar
              ? "اضغط اتصال مباشر ثم تحدّث بشكل طبيعي — الوكيل ينفّذ أدوات المنصة صوتاً لصوت."
              : "Tap Connect live, then speak naturally — the agent runs platform tools voice-to-voice."}
          </p>
        )}
        {realtime.messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "rounded-lg px-3 py-2 text-sm max-w-[92%]",
              message.role === "user"
                ? "ms-auto bg-primary text-primary-foreground"
                : "me-auto bg-card border"
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
                if (part.type.startsWith("tool-")) {
                  const tp = part as {
                    type: string;
                    state?: string;
                    output?: unknown;
                  };
                  const running =
                    tp.state === "input-streaming" ||
                    tp.state === "input-available";
                  return (
                    <div
                      key={i}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs font-mono flex gap-2",
                        running && "border-amber-500/40 bg-amber-500/5",
                        tp.state === "output-available" &&
                          "border-emerald-500/40 bg-emerald-500/5"
                      )}
                    >
                      <Wrench
                        className={cn(
                          "size-3.5 mt-0.5",
                          running && "animate-spin"
                        )}
                      />
                      <div>
                        <div className="font-semibold">{toolLabel(tp.type)}</div>
                        {tp.state === "output-available" && tp.output != null && (
                          <pre className="mt-1 max-h-24 overflow-auto opacity-80">
                            {JSON.stringify(tp.output).slice(0, 360)}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
      </div>

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
                realtime.sendTextMessage(input.trim());
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
              realtime.sendTextMessage(input.trim());
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
                if (realtime.isCapturing) {
                  realtime.stopAudioCapture();
                } else if (streamRef.current) {
                  realtime.startAudioCapture(streamRef.current);
                }
              }}
            >
              {realtime.isCapturing ? (
                <MicOff className="size-4 me-2" />
              ) : (
                <Mic className="size-4 me-2" />
              )}
              {realtime.isCapturing
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
