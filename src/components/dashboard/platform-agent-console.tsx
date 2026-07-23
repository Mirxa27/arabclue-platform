"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
import { PageHeader } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Mic,
  MicOff,
  Send,
  Square,
  Volume2,
  VolumeX,
  Sparkles,
  Radio,
} from "lucide-react";
import type { PlatformAgentUIMessage } from "@/lib/agents/platform/main-agent";
import type { VoiceLiveConfigResponse } from "@/lib/agents/platform/voice-types";
import { extractTheaterTools, isToolRunning } from "@/lib/agents/platform/mission-tool-parts";
import { LiveVoiceSession } from "./live-voice-session";
import { MissionAttachmentTray } from "./mission-attachment-tray";
import {
  MissionExecutionFeed,
  type MissionFeedItem,
} from "./mission-execution-feed";
import { MissionToolTheater } from "./mission-tool-theater";
import { MissionPerformanceStage } from "./mission-performance-fx";
import { MissionExtensionBridge } from "./mission-extension-bridge";
import { MissionPulseWidget } from "./mission-pulse-widget";

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
  const [attachments, setAttachments] = useState<
    Array<{
      id: string;
      originalName: string;
      docCategory: string;
      confidence: number;
      routeStatus: string;
      source: string;
    }>
  >([]);
  const [feedItems, setFeedItems] = useState<MissionFeedItem[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/platform-agent/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeProjectId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.mission?.id) return;
        setMissionId(data.mission.id);
        setAttachments(data.mission.attachments ?? []);
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
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

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

  const { messages, sendMessage, status, stop, error } =
    useChat<PlatformAgentUIMessage>({
      transport,
      onError: (err) => console.error("[platform-agent]", err),
    });

  const busy = status === "submitted" || status === "streaming";
  const ar = locale === "ar";

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
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, interim, status]);

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

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      alert(
        ar
          ? "المتصفح لا يدعم التعرف على الصوت. استخدم الإدخال النصي."
          : "Speech recognition is not supported in this browser. Use text input."
      );
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
  }, [ar, stopListening]);

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
    <div className="flex flex-col gap-4 h-[calc(100vh-8rem)] min-h-[560px]">
      <PageHeader
        title={ar ? "مركز قيادة الصوت" : "Voice Mission Control"}
        subtitle={
          ar
            ? "تحدّث أو أسقط ملفاً — شاهد الأدوات ومصنع المستندات يعملان أمامك لحظة بلحظة."
            : "Speak or drop a file — watch every tool and the document forge run live in front of you."
        }
        locale={locale}
        badge="none"
      />

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
            decision?: { category?: string; confidence?: number };
          };
          if (data.attachment) {
            setAttachments((prev) => [data.attachment!, ...prev].slice(0, 40));
          }
          if (data.autopilot?.projectId) {
            setActiveProjectId(data.autopilot.projectId);
          }
          if (data.autopilot?.mode === "autopilot") {
            setFollowView("agents");
            setFollowNote(data.autopilot.message || "autopilot pipeline started");
          }
          setFeedItems((prev) =>
            [
              {
                id: `upload-${Date.now()}`,
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
            decision?: { category?: string; confidence?: number };
            message?: string;
          };
          if (data.attachment) {
            setAttachments((prev) => [data.attachment!, ...prev].slice(0, 40));
          }
          if (data.autopilot?.projectId) {
            setActiveProjectId(data.autopilot.projectId);
          }
          setFeedItems((prev) =>
            [
              {
                id: `ext-${Date.now()}`,
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "live" ? "default" : "outline"}
          className="gap-1"
          disabled={!liveConfig?.enabled}
          onClick={() => setMode("live")}
        >
          <Radio className="size-3.5" />
          {ar ? "مباشر (Live)" : "Live voice"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "classic" ? "default" : "outline"}
          onClick={() => setMode("classic")}
        >
          {ar ? "وضع المتصفح" : "Browser mode"}
        </Button>
        {liveConfig && !liveConfig.enabled && (
          <span className="text-xs text-muted-foreground max-w-xl">
            {liveConfig.reason}
          </span>
        )}
        {liveConfig?.enabled && (
          <Badge variant="secondary" className="font-mono text-[10px]">
            {liveConfig.provider} · {liveConfig.modelId}
          </Badge>
        )}
        {followView && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            onClick={() => setView(followView)}
          >
            {ar ? "عرض الشاشة:" : "Watch screen:"} {followView}
            {followNote ? ` — ${followNote}` : ""}
          </Button>
        )}
      </div>

      {mode === "live" && liveConfig?.enabled ? (
        <LiveVoiceSession
          config={liveConfig}
          missionId={missionId}
          activeProjectId={activeProjectId}
          externalFeed={feedItems}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-3" />
              {ar ? "وصول كامل ضمن صلاحياتك" : "Full access within your role"}
            </Badge>
            {busy && (
              <Badge className="gap-1 animate-pulse">
                <Loader2 className="size-3 animate-spin" />
                {ar ? "ينفّذ…" : "Executing…"}
              </Badge>
            )}
            {listening && (
              <Badge variant="destructive" className="gap-1 animate-pulse">
                <Mic className="size-3" />
                {ar ? "يستمع" : "Listening"}
              </Badge>
            )}
          </div>

          <MissionPerformanceStage
            locale={locale}
            performing={performing}
            tools={theaterTools}
            className="flex-1 min-h-0"
          >
          <div className="grid flex-1 min-h-0 gap-4 p-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)]">
            <div className="flex flex-col min-h-0 gap-3">
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto rounded-2xl border border-cyan-500/15 bg-gradient-to-b from-background/80 via-teal-500/[0.04] to-background/80 p-4 space-y-4 backdrop-blur-[2px]"
                dir={ar ? "rtl" : "ltr"}
              >
                {messages.length === 0 && (
                  <div className="text-sm text-muted-foreground max-w-xl leading-relaxed">
                    {ar
                      ? "جرّب: «اعرض مشاريعي»، «أنشئ مشروع مناقصة»، «شغّل الوكلاء» — المسرح على اليمين يعرض كل أداة ومستند."
                      : "Try: “List my projects”, “Create a tender”, “Run the agents” — the theater on the right visualizes every tool and document."}
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-xl px-3 py-2 text-sm max-w-[94%] transition-shadow",
                      message.role === "user"
                        ? "ms-auto bg-primary text-primary-foreground"
                        : "me-auto bg-card/90 border border-border/70",
                      message.role === "assistant" &&
                        busy &&
                        "shadow-[0_0_24px_rgba(34,211,238,0.12)]"
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
                      {message.role === "user"
                        ? ar
                          ? "أنت"
                          : "You"
                        : ar
                          ? "الوكيل"
                          : "Copilot"}
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

                {interim && (
                  <div className="text-sm text-muted-foreground italic">
                    {interim}…
                  </div>
                )}
              </div>

              <MissionExecutionFeed locale={locale} items={feedItems.slice(0, 6)} />
            </div>

            <MissionToolTheater
              locale={locale}
              tools={theaterTools}
              isCapturing={listening}
              isSpeaking={busy && voiceOut}
              className="overflow-y-auto"
            />
          </div>
          </MissionPerformanceStage>

          {error && (
            <div className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2">
              {error.message}
            </div>
          )}

          <div className="flex flex-col gap-2" dir={ar ? "rtl" : "ltr"}>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                ar
                  ? "اكتب أو تحدّث… اطلب أي إجراء على المنصة"
                  : "Type or speak… ask for any platform action"
              }
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              disabled={busy}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="lg"
                className={cn(listening && "animate-pulse")}
                onClick={() => (listening ? stopListening() : speakAndSend())}
                disabled={busy && !listening}
              >
                {listening ? (
                  <MicOff className="size-4 me-2" />
                ) : (
                  <Mic className="size-4 me-2" />
                )}
                {listening
                  ? ar
                    ? "إيقاف الاستماع"
                    : "Stop listening"
                  : ar
                    ? "تحدّث وأرسل"
                    : "Speak & send"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void submit()}
                disabled={busy || !input.trim()}
              >
                <Send className="size-4 me-2" />
                {ar ? "إرسال" : "Send"}
              </Button>
              {busy && (
                <Button type="button" variant="outline" onClick={() => stop()}>
                  <Square className="size-4 me-2" />
                  {ar ? "إيقاف" : "Stop"}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setVoiceOut((v) => {
                    if (v) window.speechSynthesis?.cancel();
                    return !v;
                  });
                }}
              >
                {voiceOut ? (
                  <Volume2 className="size-4 me-2" />
                ) : (
                  <VolumeX className="size-4 me-2" />
                )}
                {voiceOut
                  ? ar
                    ? "صوت الرد"
                    : "Voice replies"
                  : ar
                    ? "صامت"
                    : "Muted"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
