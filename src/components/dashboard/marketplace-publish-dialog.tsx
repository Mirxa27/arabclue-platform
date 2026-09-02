"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { tr } from "@/lib/i18n";
import { selectApiFailureMessage } from "@/lib/api-failure-message";
import type { TemplateCategory } from "@/lib/proposal-builder-types";

const CATEGORIES: TemplateCategory[] = [
  "construction",
  "it",
  "consulting",
  "government",
  "healthcare",
  "general",
];

const DEFAULT_SECTION_TYPES = [
  "cover",
  "executive-summary",
  "technical-approach",
  "qualifications",
  "compliance",
] as const;

function slugifyKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function MarketplacePublishDialog({
  open,
  onOpenChange,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: "ar" | "en";
}) {
  const ar = locale === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("general");
  const [isPublic, setIsPublic] = useState(false);
  const [sectionTypesText, setSectionTypesText] = useState(
    DEFAULT_SECTION_TYPES.join(", ")
  );

  const publish = useMutation({
    mutationFn: async () => {
      const templateKey = slugifyKey(nameEn || nameAr);
      if (!templateKey) {
        throw new Error(
          ar ? "مفتاح القالب غير صالح" : "Template key is invalid"
        );
      }
      const sectionTypes = sectionTypesText
        .split(/[,\n]/)
        .map((part) => part.trim())
        .filter(Boolean);
      if (sectionTypes.length === 0) {
        throw new Error(
          ar ? "أضف نوع قسم واحداً على الأقل" : "Add at least one section type"
        );
      }

      const response = await fetch("/api/templates/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey,
          name: { ar: nameAr.trim(), en: nameEn.trim() },
          description: {
            ar: descriptionAr.trim(),
            en: descriptionEn.trim(),
          },
          category,
          sectionTypes,
          isPublic,
          tags: [],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          selectApiFailureMessage(body, locale) ??
            (ar ? "فشل نشر القالب" : "Failed to publish template")
        );
      }
      return body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["template-marketplace"] });
      toast({
        title: ar ? "تم نشر القالب" : "Template published",
      });
      onOpenChange(false);
      setNameEn("");
      setNameAr("");
      setDescriptionEn("");
      setDescriptionAr("");
      setIsPublic(false);
      setSectionTypesText(DEFAULT_SECTION_TYPES.join(", "));
    },
    onError: (error: Error) => {
      toast({
        title: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr("marketplace_publish_action", locale)}</DialogTitle>
          <DialogDescription>
            {ar
              ? "انشر قالباً ثنائي اللغة لمساحة العمل. الأنواع تحدد أقسام العرض عند التطبيق."
              : "Publish a bilingual workspace template. Section types define proposal outline on apply."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mp-name-en">Name (EN)</Label>
              <Input
                id="mp-name-en"
                dir="ltr"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-name-ar">الاسم (AR)</Label>
              <Input
                id="mp-name-ar"
                dir="rtl"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mp-desc-en">Description (EN)</Label>
              <Textarea
                id="mp-desc-en"
                dir="ltr"
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-desc-ar">الوصف (AR)</Label>
              <Textarea
                id="mp-desc-ar"
                dir="rtl"
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{ar ? "الفئة" : "Category"}</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as TemplateCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mp-sections">
              {ar ? "أنواع الأقسام (مفصولة بفاصلة)" : "Section types (comma-separated)"}
            </Label>
            <Textarea
              id="mp-sections"
              dir="ltr"
              value={sectionTypesText}
              onChange={(e) => setSectionTypesText(e.target.value)}
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            {ar ? "جعل القالب عاماً" : "Make template public"}
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={publish.isPending}
          >
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            disabled={
              publish.isPending ||
              !nameEn.trim() ||
              !nameAr.trim() ||
              !descriptionEn.trim() ||
              !descriptionAr.trim()
            }
            onClick={() => publish.mutate()}
          >
            {publish.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {tr("marketplace_publish_action", locale)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
