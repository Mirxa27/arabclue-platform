"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
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
  Radio,
} from "lucide-react";
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
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, setMessages]);

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
      kitMeta={{ files: attachments.length }}
      statusBadges={
        <>
          {followView ? (
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
          ) : null}
          {mode !== "live" || !liveConfig?.enabled ? (
            <>
              {busy ? (
                <Badge className="gap-1 animate-pulse">
                  <Loader2 className="size-3 animate-spin" />
                  {ar ? "ينفّذ…" : "Executing…"}
                </Badge>
              ) : null}
              {listening ? (
                <Badge variant="destructive" className="gap-1 animate-pulse">
                  <Mic className="size-3" />
                  {ar ? "يستمع" : "Listening"}
                </Badge>
              ) : null}
            </>
          ) : null}
        </>
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
                setFollowNote(
                  data.autopilot.message || "autopilot pipeline started"
                );
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
        </>
      }
      composer={
        mode === "live" && liveConfig?.enabled ? undefined : (
          <div className="flex flex-col gap-2">
            {error ? (
              <div className="rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {error.message}
              </div>
            ) : null}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                ar
                  ? "اكتب أمراً… مثل: اعرض مشاريعي، أنشئ مناقصة، شغّل الوكلاء"
                  : "Type a command… e.g. list projects, create a tender, run agents"
              }
              rows={2}
              className="min-h-[72px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              disabled={busy}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="lg"
                className={cn("min-w-[9.5rem]", listening && "animate-pulse")}
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
                    ? "إيقاف"
                    : "Stop"
                  : ar
                    ? "تحدّث"
                    : "Speak"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => void submit()}
                disabled={busy || !input.trim()}
              >
                <Send className="size-4 me-2" />
                {ar ? "إرسال" : "Send"}
              </Button>
              {busy ? (
                <Button type="button" variant="outline" onClick={() => stop()}>
                  <Square className="size-4 me-2" />
                  {ar ? "إيقاف التنفيذ" : "Stop run"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="ms-auto"
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
                    : "Voice on"
                  : ar
                    ? "صامت"
                    : "Muted"}
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
