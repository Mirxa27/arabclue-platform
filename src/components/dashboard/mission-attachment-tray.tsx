"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Camera,
  FileUp,
  Globe2,
  Link2,
  Loader2,
  Mail,
  Undo2,
} from "lucide-react";
import { MISSION_CONNECTORS } from "@/lib/agents/platform/connectors";

type AttachmentRow = {
  id: string;
  originalName: string;
  docCategory: string;
  confidence: number;
  routeStatus: string;
  source: string;
};

type Props = {
  locale: "ar" | "en";
  missionId: string | null;
  activeProjectId: string | null;
  attachments: AttachmentRow[];
  busy?: boolean;
  onUploaded: (payload: unknown) => void;
  onUndo?: () => void;
};

export function MissionAttachmentTray({
  locale,
  missionId,
  activeProjectId,
  attachments,
  busy,
  onUploaded,
  onUndo,
}: Props) {
  const ar = locale === "ar";
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectors = useMemo(() => MISSION_CONNECTORS, []);

  async function uploadFile(file: File, source: string) {
    if (!missionId) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("source", source);
      if (activeProjectId) form.set("activeProjectId", activeProjectId);
      const res = await fetch(
        `/api/platform-agent/missions/${missionId}/attachments`,
        { method: "POST", body: form }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onUploaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submitUrl() {
    if (!missionId || !url.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/platform-agent/missions/${missionId}/attachments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            activeProjectId,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "URL import failed");
      setUrl("");
      onUploaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL import failed");
    } finally {
      setUploading(false);
    }
  }

  async function submitPaste(text: string, source: "paste" | "browser" | "email") {
    if (!missionId || !text.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/platform-agent/missions/${missionId}/attachments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            source,
            activeProjectId,
            fileName:
              source === "browser"
                ? "browser-capture.txt"
                : source === "email"
                  ? "email-import.txt"
                  : "pasted-content.txt",
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Import failed");
      onUploaded(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files || []);
          void Promise.all(files.map((f) => uploadFile(f, "upload")));
        }}
        className={cn(
          "rounded-2xl border border-dashed px-4 py-5 transition-colors",
          "bg-gradient-to-br from-sky-500/5 via-background to-emerald-500/5",
          dragOver ? "border-primary bg-primary/5" : "border-border/80"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {ar
                ? "أسقط الملفات — الوكيل يصنّف ويشغّل المنصة تلقائياً"
                : "Drop files — the agent classifies and runs the platform"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {ar
                ? "مناقصات، ZIP، صور، روابط، كاميرا، لقطة متصفح، بريد/Drive"
                : "Tenders, ZIP, images, URLs, camera, browser capture, email/Drive"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!missionId || uploading || busy}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-3.5 me-1.5 animate-spin" />
              ) : (
                <FileUp className="size-3.5 me-1.5" />
              )}
              {ar ? "رفع" : "Upload"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!missionId || uploading}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="size-3.5 me-1.5" />
              {ar ? "كاميرا" : "Camera"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!missionId || uploading}
              onClick={() => {
                const text = window.prompt(
                  ar ? "الصق نص الصفحة أو الملاحظة" : "Paste page/note text"
                );
                if (text) void submitPaste(text, "browser");
              }}
            >
              <Globe2 className="size-3.5 me-1.5" />
              {ar ? "متصفح" : "Browser"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!missionId || uploading}
              onClick={() => {
                const text = window.prompt(
                  ar
                    ? "الصق محتوى البريد أو الملف المصدَّر من Drive/OneDrive"
                    : "Paste email body or content exported from Drive/OneDrive"
                );
                if (text) void submitPaste(text, "email");
              }}
            >
              <Mail className="size-3.5 me-1.5" />
              {ar ? "بريد/Drive" : "Email/Drive"}
            </Button>
            {onUndo ? (
              <Button type="button" size="sm" variant="ghost" onClick={onUndo}>
                <Undo2 className="size-3.5 me-1.5" />
                Undo
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={ar ? "https://… استيراد رابط" : "https://… import URL"}
            className="h-9 max-w-md"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!url.trim() || !missionId || uploading}
            onClick={() => void submitUrl()}
          >
            <Link2 className="size-3.5 me-1.5" />
            {ar ? "جلب" : "Fetch"}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {connectors.map((c) => (
            <Badge
              key={c.id}
              variant="secondary"
              className="text-[10px]"
              title={ar ? c.description.ar : c.description.en}
            >
              {ar ? c.label.ar : c.label.en}
            </Badge>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border bg-card/80 px-3 py-2 text-xs max-w-full"
            >
              <div className="font-medium truncate">{a.originalName}</div>
              <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                <span>{a.docCategory}</span>
                <span>{Math.round(a.confidence * 100)}%</span>
                <span>{a.routeStatus}</span>
                <span>{a.source}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        multiple
        accept={connectors.find((c) => c.id === "upload")?.accept}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          void Promise.all(files.map((f) => uploadFile(f, "upload")));
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file, "camera");
          e.target.value = "";
        }}
      />
    </div>
  );
}
