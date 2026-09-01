"use client";

/**
 * The platform agent, available on the page you are already on.
 *
 * `PlatformAgentConsole` is the full surface — voice, live mode, mission feed,
 * attachment kit — and it stays on its own view for people who want it. This is
 * the smaller half of it: ask, watch the tools run, get taken where you asked to
 * go. Same route, same agent, same tools, same rate limit.
 */

import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
import { viewLabel } from "@/lib/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Send,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import {
  getToolPartName,
  humanActionLabel,
  isToolFailed,
  isToolLikePart,
  isToolRunning,
} from "@/lib/agents/platform/mission-tool-parts";
import type { PlatformAgentUIMessage } from "@/lib/agents/platform/main-agent";

type ToolPart = {
  type: string;
  toolCallId?: string;
  state?: string;
  output?: Record<string, unknown>;
};

function isToolPart(part: { type: string }): boolean {
  return isToolLikePart(part as Parameters<typeof isToolLikePart>[0]);
}

function textOf(message: PlatformAgentUIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function toolPartsOf(message: PlatformAgentUIMessage): ToolPart[] {
  return message.parts.filter(isToolPart) as unknown as ToolPart[];
}

export function AssistantDock() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { view, activeProjectId, setActiveProjectId, setView } = useUI();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const appliedToolKeys = useRef<Set<string>>(new Set());

  // Rebuilt when the user changes page, so the next message carries where they
  // actually are. The server resolves it against the route table before it can
  // reach the prompt.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<PlatformAgentUIMessage>({
        api: "/api/platform-agent/chat",
        body: { activeProjectId, currentView: view },
      }),
    [activeProjectId, view]
  );

  const { messages, sendMessage, status, stop, error } =
    useChat<PlatformAgentUIMessage>({ transport });

  const busy = status === "submitted" || status === "streaming";

  // Tool outputs drive the UI the same way they do in the console: focus the
  // project it acted on, and follow it to the screen it opened.
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of toolPartsOf(message)) {
        if (part.state !== "output-available" || !part.output) continue;
        const key = `${message.id}:${part.toolCallId ?? part.type}`;
        if (appliedToolKeys.current.has(key)) continue;
        appliedToolKeys.current.add(key);

        const out = part.output;
        if (typeof out.projectId === "string" && out.projectId) {
          setActiveProjectId(out.projectId);
        }
        if (out.uiAction === "navigate" && typeof out.view === "string") {
          // Unlike the console — which *is* the overview screen, so a tool
          // pointing there means "stay put" — this dock floats over whatever
          // page the user is on, so every destination is a real move. And the
          // dock has to get out of the way: a drawer left open over the screen
          // the agent just opened hides the thing that was asked for.
          startTransition(() => setView(out.view as DashboardView));
          setOpen(false);
        }
      }
    }
  }, [messages, setActiveProjectId, setView]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  function submit(): void {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  }

  const starters = ar
    ? [
        "ما الذي يجب أن أفعله بعد ذلك؟",
        "لخّص هذه الشاشة",
        "شغّل الفريق على مشروعي النشط",
      ]
    : [
        "What should I do next?",
        "Summarise this screen",
        "Run the team on my active project",
      ];

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ar ? "افتح المساعد" : "Open the assistant"}
        className="fixed bottom-4 end-4 z-40 h-11 rounded-full shadow-lg gap-2 px-4"
      >
        <Sparkles className="size-4" />
        <span className="text-xs font-semibold">
          {ar ? "اسأل الوكيل" : "Ask the agent"}
        </span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={ar ? "left" : "right"}
          className="w-full sm:max-w-md p-0 flex flex-col gap-0"
        >
          <SheetHeader className="px-4 py-3 border-b text-start">
            <SheetTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {ar ? "وكيل أرب كلو" : "ArabClue agent"}
            </SheetTitle>
            <p className="text-[11px] text-muted-foreground">
              {ar
                ? `يرى صفحة ${viewLabel(view, locale)} ويمكنه التنفيذ نيابةً عنك`
                : `Sees your ${viewLabel(view, locale)} screen and can act for you`}
            </p>
          </SheetHeader>

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3"
          >
            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {ar
                    ? "اطلب ما تريد بلغتك — الوكيل ينفّذ أدوات المنصة."
                    : "Ask in your own words — the agent runs platform tools."}
                </p>
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendMessage({ text: s })}
                    className="w-full text-start text-xs rounded-lg border bg-muted/40 px-3 py-2 hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              messages.map((m) => {
                const text = textOf(m);
                const tools = toolPartsOf(m);
                return (
                  <div key={m.id} className="space-y-1.5">
                    {tools.map((t, i) => {
                      const name = getToolPartName(
                        t as Parameters<typeof getToolPartName>[0]
                      );
                      if (!name) return null;
                      const running = isToolRunning(t.state);
                      const failed = isToolFailed(t.state);
                      return (
                        <div
                          key={`${t.toolCallId ?? t.type}-${i}`}
                          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                        >
                          {running ? (
                            <Loader2 className="size-3 animate-spin shrink-0" />
                          ) : failed ? (
                            <XCircle className="size-3 text-destructive shrink-0" />
                          ) : (
                            <CheckCircle2 className="size-3 text-emerald-600 shrink-0" />
                          )}
                          <span className="truncate">
                            {humanActionLabel(name, ar)}
                          </span>
                        </div>
                      );
                    })}
                    {text ? (
                      <div
                        className={
                          m.role === "user"
                            ? "text-xs rounded-lg bg-primary/10 px-3 py-2 ms-6"
                            : "text-xs whitespace-pre-wrap leading-relaxed"
                        }
                      >
                        {text}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}

            {error ? (
              <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                <AlertCircle className="size-3.5 shrink-0 mt-px" />
                <span>{error.message}</span>
              </div>
            ) : null}
          </div>

          <div className="border-t p-3 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder={ar ? "اكتب طلبك…" : "Type what you need…"}
              aria-label={ar ? "رسالة إلى الوكيل" : "Message the agent"}
              className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {busy ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void stop()}
                aria-label={ar ? "إيقاف" : "Stop"}
                className="h-9 w-9 p-0 shrink-0"
              >
                <Square className="size-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={submit}
                disabled={!input.trim()}
                aria-label={ar ? "إرسال" : "Send"}
                className="h-9 w-9 p-0 shrink-0"
              >
                <Send className="size-3.5" />
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
