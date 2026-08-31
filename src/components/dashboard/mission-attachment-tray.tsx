"use client";

import { apiErrorText } from "@/lib/api-failure-message";

import { useId, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { Camera, FileUp, Globe2, Link2, Loader2, Mail, Undo2, Sparkles } from "lucide-react";
import { MISSION_CONNECTORS } from "@/lib/agents/platform/connectors";

type AttachmentRow = {
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

const EXTERNAL_IMPORT_SOURCES: Array<{ id: ExternalImportSource; label: { ar: string; en: string }; helper: { ar: string; en: string } }> = [
  { id: "email", label: { ar: "البريد", en: "Email" }, helper: { ar: "نص الرسالة أو مرفق محفوظ من البريد.", en: "Email body text or a saved mail attachment." } },
  { id: "google_drive", label: { ar: "Google Drive", en: "Google Drive" }, helper: { ar: "محتوى أو ملف مصدّر من Google Drive.", en: "Content or a file exported from Google Drive." } },
  { id: "onedrive", label: { ar: "OneDrive", en: "OneDrive" }, helper: { ar: "محتوى أو ملف مصدّر من OneDrive.", en: "Content or a file exported from OneDrive." } },
];

export function MissionAttachmentTray({ locale, missionId, activeProjectId, attachments, busy, onUploaded, onUndo }: Props) {
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
  const importCanSubmit = Boolean(importText.trim() || (importSource !== "browser" && importFile));

  async function stageFile(file: File, source: string) {
    if (!missionId) return;
    const form = new FormData();
    form.set("file", file);
    form.set("source", source);
    if (activeProjectId) form.set("activeProjectId", activeProjectId);
    const res = await fetch(`/api/platform-agent/missions/${missionId}/attachments`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(apiErrorText(data, locale));
    onUploaded(data);
  }

  async function stageText(text: string, source: PasteImportSource | "paste") {
    if (!missionId || !text.trim()) return;
    const res = await fetch(`/api/platform-agent/missions/${missionId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        source,
        activeProjectId,
        fileName: source === "browser" ? "browser-capture.txt" : source === "email" ? "email-import.txt" : source === "google_drive" ? "google-drive-import.txt" : source === "onedrive" ? "onedrive-import.txt" : "pasted-content.txt",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(apiErrorText(data, locale));
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
      const res = await fetch(`/api/platform-agent/missions/${missionId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), activeProjectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorText(data, locale));
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
      if (importFile && importSource !== "browser") await stageFile(importFile, importSource);
      if (importText.trim()) await stageText(importText, importSource);
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
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const files = Array.from(e.dataTransfer.files || []); void Promise.all(files.map((f) => uploadFile(f, "upload"))); }}
        className={cn(
          "group/drop relative overflow-hidden rounded-[16px] border backdrop-blur-xl transition-all duration-300",
          "bg-white/[0.66] dark:bg-zinc-900/40 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset]",
          dragOver
            ? "border-teal-500/30 bg-teal-500/[0.06] shadow-[0_0_0_1px_rgba(20,184,166,0.14),0_0_28px_-10px_rgba(20,184,166,0.42)]"
            : "border-zinc-200/70 dark:border-white/[0.08]",
          "px-3 py-3 sm:px-4 sm:py-4"
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_100%_at_20%_0%,rgba(20,184,166,0.08),transparent_60%)] opacity-60" />
        <div className="relative flex flex-col gap-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.06]"><Sparkles className="size-3.5 text-teal-600 dark:text-teal-300" /></span>
                <p className="text-[13px] font-[600] tracking-tight">{ar ? "أسقط الملفات — يصنف ويشغل تلقائياً" : "Drop files — auto-classify & run"}</p>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">{ar ? "مناقصات، ZIP، صور، روابط، كاميرا، متصفح، بريد، Google Drive، OneDrive" : "Tenders, ZIP, images, URLs, camera, browser, email, Google Drive, OneDrive"}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:max-w-[62%]">
              <Button type="button" size="sm" variant="default" disabled={!missionId || uploading || busy} onClick={() => fileRef.current?.click()} className="h-8 rounded-full px-3 text-[12px] gap-1.5">
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />}
                {ar ? "رفع" : "Upload"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!missionId || uploading} onClick={() => cameraRef.current?.click()} className="h-8 rounded-full px-3 text-[11px] gap-1">
                <Camera className="size-3.5" />
                {ar ? "كاميرا" : "Camera"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!missionId || uploading} onClick={() => openImportDialog("browser")} className="h-8 rounded-full px-3 text-[11px] gap-1">
                <Globe2 className="size-3.5" />
                {ar ? "متصفح" : "Browser"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!missionId || uploading} onClick={() => openImportDialog("email")} className="h-8 rounded-full px-3 text-[11px] gap-1">
                <Mail className="size-3.5" />
                {ar ? "بريد" : "Email"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!missionId || uploading} onClick={() => openImportDialog("google_drive")} className="h-8 rounded-full px-3 text-[11px]">Drive</Button>
              <Button type="button" size="sm" variant="outline" disabled={!missionId || uploading} onClick={() => openImportDialog("onedrive")} className="h-8 rounded-full px-3 text-[11px]">OneDrive</Button>
              {onUndo ? <Button type="button" size="sm" variant="ghost" onClick={onUndo} className="h-8 rounded-full px-3 text-[11px] gap-1"><Undo2 className="size-3.5" /> Undo</Button> : null}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Link2 className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={ar ? "https://… استيراد رابط" : "https://… import URL"} className="h-9 ps-8 rounded-full bg-white/80 dark:bg-black/20 border-zinc-200/70 dark:border-white/10 text-[13px]" />
            </div>
            <Button type="button" size="sm" variant="secondary" disabled={!url.trim() || !missionId || uploading} onClick={() => void submitUrl()} className="h-9 rounded-full px-4 shrink-0">
              <Link2 className="size-3.5 me-1.5" />
              {ar ? "جلب" : "Fetch"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1">
            {connectors.map((c) => (
              <Badge key={c.id} variant="secondary" className="rounded-full text-[10px] border-zinc-200/60 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400">
                {ar ? c.label.ar : c.label.en}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error ? <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-300" role="alert">{error}</motion.p> : null}
      </AnimatePresence>

      {attachments.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {attachments.map((a) => (
            <motion.div key={a.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="group/card relative overflow-hidden rounded-[14px] border border-zinc-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-zinc-900/50 backdrop-blur px-3 py-2.5 shadow-sm">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-black/5 dark:via-white/10 to-transparent" />
              <div className="font-medium text-[12px] truncate tracking-tight">{a.originalName}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="outline" className="rounded-full text-[9px] px-1.5 py-0">{a.docCategory}</Badge>
                <Badge variant="secondary" className="rounded-full text-[9px] px-1.5 py-0">{Math.round(a.confidence * 100)}%</Badge>
                {a.runPipeline ? (
                  <Badge variant="outline" className="rounded-full text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-800 dark:text-emerald-200">
                    {ar ? "مؤهل للخط" : "pipeline-eligible"}
                  </Badge>
                ) : null}
                <span className="text-[10px] text-zinc-500">{a.routeStatus} · {a.source}</span>
              </div>
              {a.reasons && a.reasons.length > 0 ? (
                <p className="mt-1.5 text-[10px] leading-snug text-zinc-500 line-clamp-2" title={a.reasons.join(" · ")}>
                  {a.reasons.join(" · ")}
                </p>
              ) : null}
              {a.clarifyingQuestion ? (
                <p className="mt-1 text-[10px] leading-snug text-amber-800 dark:text-amber-200 line-clamp-2" role="status">
                  {a.clarifyingQuestion}
                </p>
              ) : null}
            </motion.div>
          ))}
        </div>
      ) : null}

      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) { setImportText(""); setImportFile(null); } }}>
        <DialogContent className="max-w-xl rounded-[20px] border-zinc-200/70 dark:border-white/10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold tracking-tight">{importSource === "browser" ? (ar ? "استيراد لقطة متصفح" : "Import browser capture") : ar ? "استيراد من مصدر خارجي" : "Import external source"}</DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed">{importSource === "browser" ? (ar ? "الصق نص الصفحة أو الملاحظة ليصنفها الوكيل." : "Paste page or note text so the agent can classify it.") : ar ? "اختر المصدر بدقة حتى يبقى محفوظاً في سجل المهمة." : "Choose the exact source so Mission Control preserves it."}</DialogDescription>
          </DialogHeader>

          {importSource !== "browser" ? (
            <RadioGroup value={importSource} onValueChange={(value) => setImportSource(value as ExternalImportSource)} className="grid gap-2 sm:grid-cols-3">
              {EXTERNAL_IMPORT_SOURCES.map((source) => (
                <Label key={source.id} htmlFor={`${importTextId}-${source.id}`} className="rounded-xl border border-zinc-200/70 dark:border-white/10 p-3 text-start hover:bg-black/[0.02] dark:hover:bg-white/[0.04] cursor-pointer transition-colors">
                  <div className="flex items-start gap-2">
                    <RadioGroupItem id={`${importTextId}-${source.id}`} value={source.id} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{ar ? source.label.ar : source.label.en}</span>
                      <span className="mt-1 block text-[11px] font-normal leading-snug text-zinc-500">{ar ? source.helper.ar : source.helper.en}</span>
                    </span>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={importTextId} className="text-[12px]">{ar ? "النص الملصق" : "Pasted text"}</Label>
            <Textarea id={importTextId} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={importSource === "browser" ? (ar ? "الصق نص الصفحة أو الملاحظة..." : "Paste page or note text...") : ar ? "الصق نص البريد أو محتوى الملف المصدّر..." : "Paste email body or exported document content..."} className="min-h-32 rounded-xl" />
          </div>

          {importSource !== "browser" ? (
            <div className="space-y-2">
              <Label htmlFor={importFileId} className="text-[12px]">{ar ? "ملف اختياري" : "Optional file"}</Label>
              <Input id={importFileId} type="file" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} accept={connectors.find((c) => c.id === "upload")?.accept} className="rounded-xl" />
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)} disabled={uploading} className="rounded-full">{ar ? "إلغاء" : "Cancel"}</Button>
            <Button type="button" onClick={() => void submitImportDialog()} disabled={!missionId || !importCanSubmit || uploading} className="rounded-full">
              {uploading ? <Loader2 className="size-3.5 me-1.5 animate-spin" /> : null}
              {ar ? "استيراد" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input ref={fileRef} type="file" className="hidden" multiple accept={connectors.find((c) => c.id === "upload")?.accept} onChange={(e) => { const files = Array.from(e.target.files || []); void Promise.all(files.map((f) => uploadFile(f, "upload"))); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadFile(file, "camera"); e.target.value = ""; }} />
    </div>
  );
}
