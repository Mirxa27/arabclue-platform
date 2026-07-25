"use client";

import { startTransition, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useUI } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Search,
  Star,
  Plus,
  Loader2,
  FileText,
  Building2,
  Cpu,
  Briefcase,
  Landmark,
  Heart,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TemplateMarketplaceItem,
  TemplateCategory,
  MarketplaceFilters,
} from "@/lib/proposal-builder-types";
import { getDefaultSections } from "@/lib/proposal-builder-engine";
import { writePendingProposalBuilderDraft } from "@/lib/proposal-builder-draft";
import { TemplateMarketplaceCard } from "./template-marketplace-card";

const CATEGORY_ICONS: Record<TemplateCategory, typeof FileText> = {
  construction: Building2,
  it: Cpu,
  consulting: Briefcase,
  government: Landmark,
  healthcare: Heart,
  general: Package,
};

const CATEGORIES: TemplateCategory[] = [
  "construction",
  "it",
  "consulting",
  "government",
  "healthcare",
  "general",
];

export function TemplateMarketplace() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { setView, activeProjectId } = useUI();

  const [filters, setFilters] = useState<MarketplaceFilters>({
    sortBy: "newest",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);

  function openBlankProposal() {
    const sections = getDefaultSections();
    writePendingProposalBuilderDraft({
      source: "blank",
      title: {
        ar: "عرض جديد",
        en: "New proposal",
      },
      sections,
      projectId: activeProjectId,
    });
    startTransition(() => setView("proposal-builder"));
  }

  // Fetch templates
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["template-marketplace", filters, searchQuery, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.category) params.set("category", filters.category);
      if (filters.sortBy) params.set("sortBy", filters.sortBy);
      if (filters.isFeatured !== undefined) params.set("isFeatured", String(filters.isFeatured));
      if (searchQuery) params.set("search", searchQuery);
      if (selectedCategory) params.set("category", selectedCategory);

      const res = await fetch(`/api/templates/marketplace?${params}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const templates: TemplateMarketplaceItem[] = data?.templates ?? [];

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {ar ? "سوق القوالب" : "Template Marketplace"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {ar
              ? "تصفح واستخدم قوالب العروض الجاهزة"
              : "Browse and use ready-made proposal templates"}
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openBlankProposal}>
          <Plus className="size-4" />
          {ar ? "عرض فارغ" : "Blank proposal"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/60 p-3 backdrop-blur-xl sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={ar ? "ابحث عن قوالب..." : "Search templates..."}
            className="h-9 ps-9"
          />
        </div>

        {/* Category filter */}
        <Select
          value={selectedCategory ?? "all"}
          onValueChange={(v) => setSelectedCategory(v === "all" ? null : (v as TemplateCategory))}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder={ar ? "الفئة" : "Category"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{ar ? "الكل" : "All"}</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {ar
                  ? cat === "construction" ? "إنشاءات"
                    : cat === "it" ? "تقنية معلومات"
                    : cat === "consulting" ? "استشارات"
                    : cat === "government" ? "حكومي"
                    : cat === "healthcare" ? "صحة"
                    : "عام"
                  : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select
          value={filters.sortBy ?? "newest"}
          onValueChange={(v) => setFilters((f) => ({ ...f, sortBy: v as MarketplaceFilters["sortBy"] }))}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder={ar ? "ترتيب" : "Sort by"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{ar ? "الأحدث" : "Newest"}</SelectItem>
            <SelectItem value="rating">{ar ? "التقييم" : "Rating"}</SelectItem>
            <SelectItem value="downloads">{ar ? "التحميلات" : "Downloads"}</SelectItem>
            <SelectItem value="name">{ar ? "الاسم" : "Name"}</SelectItem>
          </SelectContent>
        </Select>

        {/* Featured toggle */}
        <Button
          type="button"
          variant={filters.isFeatured ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => setFilters((f) => ({ ...f, isFeatured: f.isFeatured ? undefined : true }))}
        >
          <Star className="size-3.5" />
          {ar ? "مميز" : "Featured"}
        </Button>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(isActive ? null : cat)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/50 bg-background/50 text-muted-foreground hover:border-border hover:bg-background"
              )}
            >
              <Icon className="size-3.5" />
              {ar
                ? cat === "construction" ? "إنشاءات"
                  : cat === "it" ? "تقنية معلومات"
                  : cat === "consulting" ? "استشارات"
                  : cat === "government" ? "حكومي"
                  : cat === "healthcare" ? "صحة"
                  : "عام"
                : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          );
        })}
      </div>

      {/* Template grid */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-destructive" role="alert">
              {ar ? "فشل تحميل القوالب" : "Failed to load templates"}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
            >
              {ar ? "إعادة المحاولة" : "Retry"}
            </Button>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
            <FileText className="size-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {ar ? "لا توجد قوالب مطابقة" : "No matching templates found"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates.map((template) => (
              <TemplateMarketplaceCard
                key={template.id}
                template={template}
                locale={locale}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}