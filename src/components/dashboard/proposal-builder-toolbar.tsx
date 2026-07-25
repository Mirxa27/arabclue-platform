"use client";

import { cn } from "@/lib/utils";
import {
  Save,
  Eye,
  Edit3,
  LayoutGrid,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { ProposalMetadata, ValidationSummary } from "@/lib/proposal-builder-types";

type BuilderMode = "edit" | "preview" | "split";

export function ProposalBuilderToolbar({
  locale,
  mode,
  onModeChange,
  isDirty,
  isSaving,
  onSave,
  onValidate,
  onExportHtml,
  validationSummary,
  metadata,
  onMetadataChange,
}: {
  locale: string;
  mode: BuilderMode;
  onModeChange: (mode: BuilderMode) => void;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onValidate: () => void;
  onExportHtml?: () => void;
  validationSummary: ValidationSummary | null;
  metadata: ProposalMetadata;
  onMetadataChange: (metadata: ProposalMetadata) => void;
}) {
  const ar = locale === "ar";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/60 p-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
      {/* Left: Title input */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Input
          type="text"
          value={metadata.title[locale as "ar" | "en"]}
          onChange={(e) =>
            onMetadataChange({
              ...metadata,
              title: { ...metadata.title, [locale]: e.target.value },
            })
          }
          placeholder={ar ? "عنوان العرض..." : "Proposal title..."}
          className="h-9 max-w-xs border-border/50 bg-background/50 text-sm"
          dir={locale === "ar" ? "rtl" : "ltr"}
        />
        {isDirty && (
          <Badge variant="outline" className="text-[10px] text-amber-600">
            {ar ? "غير محفوظ" : "Unsaved"}
          </Badge>
        )}
      </div>

      {/* Center: Mode switcher */}
      <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-muted/30 p-0.5">
        <Button
          type="button"
          variant={mode === "edit" ? "default" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 px-3 text-xs"
          onClick={() => onModeChange("edit")}
        >
          <Edit3 className="size-3" />
          {ar ? "تحرير" : "Edit"}
        </Button>
        <Button
          type="button"
          variant={mode === "split" ? "default" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 px-3 text-xs"
          onClick={() => onModeChange("split")}
        >
          <LayoutGrid className="size-3" />
          {ar ? "مقسم" : "Split"}
        </Button>
        <Button
          type="button"
          variant={mode === "preview" ? "default" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 px-3 text-xs"
          onClick={() => onModeChange("preview")}
        >
          <Eye className="size-3" />
          {ar ? "معاينة" : "Preview"}
        </Button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Validation status */}
        {validationSummary && (
          <Badge
            variant={validationSummary.criticalErrors.length > 0 ? "destructive" : "outline"}
            className={cn(
              "gap-1 text-[10px]",
              validationSummary.overallScore >= 80 && "border-emerald-500/50 text-emerald-600"
            )}
          >
            {validationSummary.criticalErrors.length > 0 ? (
              <AlertCircle className="size-3" />
            ) : (
              <CheckCircle2 className="size-3" />
            )}
            {validationSummary.overallScore}%
          </Badge>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onValidate}
        >
          <CheckCircle2 className="size-3.5" />
          {ar ? "تحقق" : "Validate"}
        </Button>

        {onExportHtml ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onExportHtml}
          >
            <Download className="size-3.5" />
            {ar ? "تصدير HTML" : "Export HTML"}
          </Button>
        ) : null}

        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onSave}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          {ar ? "حفظ" : "Save"}
        </Button>
      </div>
    </div>
  );
}