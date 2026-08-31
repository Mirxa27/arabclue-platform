"use client";

import { apiErrorText } from "@/lib/api-failure-message";

import { startTransition, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useUI } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Star,
  Download,
  Eye,
  Plus,
  Sparkles,
  Loader2,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type {
  TemplateMarketplaceItem,
  TemplateCategory,
  ProposalSection,
  LocalizedString,
} from "@/lib/proposal-builder-types";
import { writePendingProposalBuilderDraft } from "@/lib/proposal-builder-draft";
import { getSectionLabel } from "@/lib/proposal-builder-engine";

const CATEGORY_LABELS: Record<TemplateCategory, { ar: string; en: string }> = {
  construction: { ar: "إنشاءات", en: "Construction" },
  it: { ar: "تقنية معلومات", en: "IT" },
  consulting: { ar: "استشارات", en: "Consulting" },
  government: { ar: "حكومي", en: "Government" },
  healthcare: { ar: "صحة", en: "Healthcare" },
  general: { ar: "عام", en: "General" },
};

type UseTemplateResponse = {
  ok?: boolean;
  proposalId?: string | null;
  persisted?: boolean;
  draft?: {
    title: LocalizedString;
    sections: ProposalSection[];
    projectId?: string | null;
  };
  template?: {
    id: string;
    templateKey: string;
    name: LocalizedString;
  };
  error?: string;
};

export function TemplateMarketplaceCard({
  template,
  locale,
}: {
  template: TemplateMarketplaceItem;
  locale: string;
}) {
  const ar = locale === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setView, activeProjectId } = useUI();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const isWorkspaceTemplate = template.source === "workspace";

  type MarketplaceDetail = TemplateMarketplaceItem & {
    publisher?: { name: string; nameAr: string | null } | null;
  };

  const detailQuery = useQuery({
    queryKey: ["template-marketplace-detail", template.id],
    enabled: previewOpen,
    queryFn: async () => {
      const res = await fetch(`/api/templates/marketplace/${template.id}`);
      const body = (await res.json().catch(() => ({}))) as {
        entry?: MarketplaceDetail;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(apiErrorText(body, ar ? "ar" : "en"));
      }
      return body.entry!;
    },
  });

  const detail: MarketplaceDetail = detailQuery.data ?? template;

  const applyDraftAndOpenBuilder = (data: UseTemplateResponse) => {
    const title = data.draft?.title ?? template.name;
    const sections = data.draft?.sections ?? [];
    if (sections.length === 0) {
      throw new Error("Template draft has no sections");
    }
    writePendingProposalBuilderDraft({
      source: "marketplace",
      templateId: template.id,
      templateKey: template.templateKey,
      proposalId: data.proposalId ?? undefined,
      title,
      sections,
      projectId: data.draft?.projectId ?? activeProjectId,
    });
    startTransition(() => setView("proposal-builder"));
    toast({
      title: ar ? "تم فتح القالب" : "Template opened",
      description: data.persisted
        ? ar
          ? "تم حفظ مسودة العرض — أكمل التحرير في منشئ العروض"
          : "Proposal draft saved — continue in Proposal Builder"
        : activeProjectId
          ? ar
            ? "تعذر الحفظ على الخادم — المسودة جاهزة محلياً"
            : "Server save skipped — local draft is ready"
          : ar
            ? "اختر مشروعاً ثم احفظ المسودة في منشئ العروض"
            : "Pick a project, then save the draft in Proposal Builder",
    });
  };

  const useTemplateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/templates/marketplace/${template.id}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProjectId || undefined,
          locale: ar ? "ar" : "en",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as UseTemplateResponse;
      if (!res.ok) {
        throw new Error(apiErrorText(body, ar ? "ar" : "en"));
      }
      return body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["template-marketplace"] });
      applyDraftAndOpenBuilder(data);
    },
    onError: (err) => {
      toast({
        title: ar ? "خطأ" : "Error",
        description:
          err instanceof Error
            ? err.message
            : ar
              ? "فشل استخدام القالب"
              : "Failed to use template",
        variant: "destructive",
      });
    },
  });

  // Rate mutation
  const rateMutation = useMutation({
    mutationFn: async (rating: number) => {
      const res = await fetch(`/api/templates/marketplace/${template.id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(apiErrorText(body, ar ? "ar" : "en"));
      }
      return res.json() as Promise<{ userRating: number; averageRating: number; ratingCount: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-marketplace"] });
      toast({
        title: ar ? "تم التقييم" : "Rating submitted",
      });
    },
    onError: (err) => {
      toast({
        title: ar ? "خطأ" : "Error",
        description:
          err instanceof Error
            ? err.message
            : ar
              ? "فشل التقييم"
              : "Failed to rate",
        variant: "destructive",
      });
    },
  });

  // Retire mutation
  const retireMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/templates/marketplace/${template.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        throw new Error(apiErrorText(body, ar ? "ar" : "en"));
      }
      return res.json() as Promise<{ retired?: boolean; alreadyRetired?: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["template-marketplace"] });
      toast({
        title: data.alreadyRetired
          ? ar ? "القالب متقاعد بالفعل" : "Template already retired"
          : ar ? "تم تقاعد القالب" : "Template retired",
      });
    },
    onError: (err) => {
      toast({
        title: ar ? "خطأ" : "Error",
        description:
          err instanceof Error
            ? err.message
            : ar
              ? "فشل التقاعد"
              : "Failed to retire",
        variant: "destructive",
      });
    },
  });

  const categoryLabel =
    CATEGORY_LABELS[template.category]?.[locale as "ar" | "en"] ??
    template.category;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background/60 backdrop-blur-xl transition-all hover:border-border hover:shadow-lg">
      {template.isFeatured && (
        <div className="absolute end-2 top-2 z-10">
          <Badge className="gap-1 bg-amber-500/90 text-white hover:bg-amber-500">
            <Sparkles className="size-3" />
            {ar ? "مميز" : "Featured"}
          </Badge>
        </div>
      )}

      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-muted/50 to-muted/20">
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="w-full max-w-[200px] space-y-2">
            <div className="h-2 w-3/4 rounded bg-primary/20" />
            <div className="h-1.5 w-full rounded bg-muted-foreground/10" />
            <div className="h-1.5 w-5/6 rounded bg-muted-foreground/10" />
            <div className="h-1.5 w-4/6 rounded bg-muted-foreground/10" />
            <div className="mt-3 h-1.5 w-full rounded bg-muted-foreground/10" />
            <div className="h-1.5 w-5/6 rounded bg-muted-foreground/10" />
            <div className="mt-3 grid grid-cols-3 gap-1">
              <div className="h-6 rounded bg-primary/10" />
              <div className="h-6 rounded bg-primary/10" />
              <div className="h-6 rounded bg-primary/10" />
            </div>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="size-3.5" />
            {ar ? "معاينة" : "Preview"}
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => useTemplateMutation.mutate()}
            disabled={useTemplateMutation.isPending}
          >
            {useTemplateMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {ar ? "استخدام" : "Use"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <Badge variant="outline" className="mb-2 w-fit text-[10px]">
          {categoryLabel}
        </Badge>

        <h3 className="mb-1 text-sm font-semibold line-clamp-2">
          {template.name[locale as "ar" | "en"]}
        </h3>

        <p className="mb-3 text-xs text-muted-foreground line-clamp-2">
          {template.description[locale as "ar" | "en"]}
        </p>

        {template.sectionTypes.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {template.sectionTypes.slice(0, 3).map((type) => (
              <span
                key={type}
                className="rounded bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground"
              >
                {type}
              </span>
            ))}
            {template.sectionTypes.length > 3 && (
              <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                +{template.sectionTypes.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        <div className="flex items-center justify-between border-t border-border/30 pt-3">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="p-0.5 transition-colors"
                disabled={rateMutation.isPending}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => rateMutation.mutate(star)}
                aria-label={ar ? `تقييم ${star} نجوم` : `Rate ${star} stars`}
              >
                <Star
                  className={cn(
                    "size-3",
                    (hoverRating || template.rating) >= star
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30"
                  )}
                />
              </button>
            ))}
            {template.ratingCount > 0 && (
              <span className="text-[10px] text-muted-foreground ms-1">
                ({template.ratingCount})
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-muted-foreground">
            <Download className="size-3" />
            <span className="text-[10px]">
              {template.downloadCount > 999
                ? `${(template.downloadCount / 1000).toFixed(1)}k`
                : template.downloadCount}
            </span>
          </div>

          <Badge variant="outline" className="text-[9px]">
            v{template.version}
          </Badge>
        </div>

        {/* Retire button for workspace templates */}
        {isWorkspaceTemplate && (
          <div className="mt-2 border-t border-border/30 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-xs text-muted-foreground hover:text-destructive"
              disabled={retireMutation.isPending}
              onClick={() => retireMutation.mutate()}
            >
              {retireMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Archive className="size-3" />
              )}
              {ar ? "تقاعد القالب" : "Retire template"}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {detail.name[locale as "ar" | "en"]}
            </DialogTitle>
            <DialogDescription>
              {detail.description[locale as "ar" | "en"]}
            </DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {ar ? "جاري التحميل…" : "Loading…"}
            </div>
          ) : detailQuery.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : ar
                  ? "فشل تحميل التفاصيل"
                  : "Failed to load detail"}
            </p>
          ) : (
            <div className="space-y-3">
              {detail.publisher ? (
                <p className="text-xs text-muted-foreground">
                  {ar ? "الناشر: " : "Publisher: "}
                  {ar
                    ? detail.publisher.nameAr || detail.publisher.name
                    : detail.publisher.name}
                </p>
              ) : null}
              {detail.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {detail.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <p className="text-xs font-medium text-muted-foreground">
                {ar ? "أقسام القالب" : "Template sections"}
              </p>
              <ol className="space-y-1.5">
                {detail.sectionTypes.map((type, index) => (
                  <li
                    key={`${type}-${index}`}
                    className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    {getSectionLabel(type, locale as "ar" | "en")}
                  </li>
                ))}
              </ol>
              <Button
                className="mt-2 w-full gap-1.5"
                onClick={() => {
                  setPreviewOpen(false);
                  useTemplateMutation.mutate();
                }}
                disabled={useTemplateMutation.isPending}
              >
                {useTemplateMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                {ar ? "استخدام هذا القالب" : "Use this template"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
