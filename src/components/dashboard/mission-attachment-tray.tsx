"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type ExternalImportSource = "email" | "google_drive" | "onedrive";
type PasteImportSource = "browser" | ExternalImportSource;

const EXTERNAL_IMPORT_SOURCES: Array<{
  id: ExternalImportSource;
  label: { ar: string; en: string };
  helper: { ar: string; en: string };
}> = [
  {
    id: "email",
    label: { ar: "البريد", en: "Email" },
    helper: {
      ar: "نص الرسالة أو مرفق محفوظ من البريد.",
      en: "Email body text or a saved mail attachment.",
    },
  },
  {
    id: "google_drive",
    label: { ar: "Google Drive", en: "Google Drive" },
    helper: {
      ar: "محتوى أو ملف مصدّر من Google Drive.",
      en: "Content or a file exported from Google Drive.",
    },
  },
  {
    id: "onedrive",
    label: { ar: "OneDrive", en: "OneDrive" },
    helper: {
      ar: "محتوى أو ملف مصدّر من OneDrive.",
      en: "Content or a file exported from OneDrive.",
    },
  },
];

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
  const importTextId = useId();
  const importFileId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSource, setImportSource] = useState<PasteImportSource>("email");
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);

  const connectors = useMemo(() => MISSION_CONNECTORS, []);
  const importCanSubmit = Boolean(
    importText.trim() || (importSource !== "browser" && importFile)
  );

  async function stageFile(file: File, source: string) {
    if (!missionId) return;
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
  }

  async function stageText(text: string, source: PasteImportSource | "paste") {
    if (!missionId || !text.trim()) return;
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
                : source === "google_drive"
                  ? "google-drive-import.txt"
                  : source === "onedrive"
                    ? "onedrive-import.txt"
                    : "pasted-content.txt",
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Import failed");
    onUploaded(data);
  }

  async function uploadFile(file: File, source: string) {
    setUploading(true);
    setError(null);
    try {
      await stageFile(file, source);
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

  function openImportDialog(source: PasteImportSource) {
    setError(null);
    setImportSource(source);
    setImportText("");
    setImportFile(null);
    setImportOpen(true);
  }

  async function submitImportDialog() {
    if (!importCanSubmit) return;
    setUploading(true);
    setError(null);
    try {
      if (importFile && importSource !== "browser") {
        await stageFile(importFile, importSource);
      }
      if (importText.trim()) {
        await stageText(importText, importSource);
      }
      setImportOpen(false);
      setImportText("");
      setImportFile(null);
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
                ? "مناقصات، ZIP، صور، روابط، كاميرا، متصفح، بريد، Google Drive، OneDrive"
                : "Tenders, ZIP, images, URLs, camera, browser, email, Google Drive, OneDrive"}
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
              onClick={() => openImportDialog("browser")}
            >
              <Globe2 className="size-3.5 me-1.5" />
              {ar ? "متصفح" : "Browser"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!missionId || uploading}
              onClick={() => openImportDialog("email")}
            >
              <Mail className="size-3.5 me-1.5" />
              {ar ? "بريد" : "Email"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!missionId || uploading}
              onClick={() => openImportDialog("google_drive")}
            >
              <FileUp className="size-3.5 me-1.5" />
              Google Drive
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!missionId || uploading}
              onClick={() => openImportDialog("onedrive")}
            >
              <FileUp className="size-3.5 me-1.5" />
              OneDrive
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

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) {
            setImportText("");
            setImportFile(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {importSource === "browser"
                ? ar
                  ? "استيراد لقطة متصفح"
                  : "Import browser capture"
                : ar
                  ? "استيراد من مصدر خارجي"
                  : "Import external source"}
            </DialogTitle>
            <DialogDescription>
              {importSource === "browser"
                ? ar
                  ? "الصق نص الصفحة أو الملاحظة ليصنّفها الوكيل."
                  : "Paste page or note text so the agent can classify it."
                : ar
                  ? "اختر المصدر بدقة حتى يبقى محفوظاً في سجل المهمة."
                  : "Choose the exact source so Mission Control preserves it."}
            </DialogDescription>
          </DialogHeader>

          {importSource !== "browser" ? (
            <RadioGroup
              value={importSource}
              onValueChange={(value) => setImportSource(value as ExternalImportSource)}
              className="grid gap-2 sm:grid-cols-3"
            >
              {EXTERNAL_IMPORT_SOURCES.map((source) => (
                <Label
                  key={source.id}
                  htmlFor={`${importTextId}-${source.id}`}
                  className="rounded-xl border p-3 text-start hover:bg-muted/50"
                >
                  <RadioGroupItem id={`${importTextId}-${source.id}`} value={source.id} />
                  <span>
                    <span className="block font-medium">
                      {ar ? source.label.ar : source.label.en}
                    </span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {ar ? source.helper.ar : source.helper.en}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={importTextId}>
              {ar ? "النص الملصق" : "Pasted text"}
            </Label>
            <Textarea
              id={importTextId}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                importSource === "browser"
                  ? ar
                    ? "الصق نص الصفحة أو الملاحظة..."
                    : "Paste page or note text..."
                  : ar
                    ? "الصق نص البريد أو محتوى الملف المصدّر..."
                    : "Paste email body or exported document content..."
              }
              className="min-h-32"
            />
          </div>

          {importSource !== "browser" ? (
            <div className="space-y-2">
              <Label htmlFor={importFileId}>
                {ar ? "ملف اختياري" : "Optional file"}
              </Label>
              <Input
                id={importFileId}
                type="file"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                accept={connectors.find((c) => c.id === "upload")?.accept}
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={uploading}
            >
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={() => void submitImportDialog()}
              disabled={!missionId || !importCanSubmit || uploading}
            >
              {uploading ? <Loader2 className="size-3.5 me-1.5 animate-spin" /> : null}
              {ar ? "استيراد" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
