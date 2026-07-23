"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Scale,
  FileText,
  Sparkles,
  Download,
  FileDown,
  Eye,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale, useUI } from "@/lib/store";
import { apiJson } from "@/lib/api-client";
import type { ApiProposal } from "@/lib/api-types";
import { BilingualContractStudio } from "./contract-studio";
import { DocumentPreviewFrame } from "./document-preview-frame";
import { ListSkeleton } from "./loading-skeletons";
import { useArtifactDownload } from "@/hooks/use-artifact-download";
import type { ContractArticle } from "@/lib/contract-format";
import type { SaudiLawResearchBrief } from "@/lib/saudi-law-research";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function parseArtifacts(raw: string | null | undefined): {
  research?: SaudiLawResearchBrief;
  articles?: ContractArticle[];
} {
  if (!raw) return {};
  try {
    const arr = JSON.parse(raw) as unknown;
    const first = Array.isArray(arr) ? arr[0] : arr;
    if (!first || typeof first !== "object") return {};
    const obj = first as Record<string, unknown>;
    return {
      research: obj.research as SaudiLawResearchBrief | undefined,
      articles: obj.articles as ContractArticle[] | undefined,
    };
  } catch {
    return {};
  }
}

export function ContractsPanel() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { activeProjectId, setView } = useUI();
  const [openId, setOpenId] = useState<string | null>(null);
  const { download, busyFormat } = useArtifactDownload();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["proposals", activeProjectId],
    queryFn: () =>
      apiJson<{ proposals: ApiProposal[] }>(
        activeProjectId
          ? `/api/proposals?projectId=${activeProjectId}`
          : "/api/proposals"
      ),
  });

  const contracts = useMemo(
    () => (data?.proposals ?? []).filter((p) => p.type === "CONTRACT"),
    [data?.proposals]
  );

  const active = contracts.find((c) => c.id === openId) ?? null;
  const artifacts = parseArtifacts(active?.artifactsJson);

  return (
    <div className="space-y-4">
      <Card className="p-5 border-border/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 flex items-center justify-center">
              <Scale className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                {ar ? "استوديو العقود الثنائية" : "Bilingual contract studio"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
                {ar
                  ? "معاينة HTML/PDF · تنزيل موثوق · مراجعة قانونية معتمدة مطلوبة — دون ادعاء يقين 100%."
                  : "HTML/PDF preview · reliable download · authorized counsel review required — never 100% legal certainty."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setView("agents")}
          >
            <Sparkles className="size-3.5" />
            {ar ? "تشغيل الوكلاء" : "Run agents"}
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : isError ? (
        <Card className="p-6 text-center space-y-2">
          <p className="text-sm text-destructive">
            {ar ? "تعذّر تحميل العقود" : "Could not load contracts"}
          </p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            {ar ? "إعادة المحاولة" : "Retry"}
          </Button>
        </Card>
      ) : contracts.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <FileText className="size-8 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {ar
              ? "لا مسودات عقود بعد. 1) أنشئ مناقصة 2) ارفع الكراسة 3) شغّل الوكلاء — المرحلة 6 تصوغ العقد."
              : "No contract drafts yet. 1) Set up a tender 2) Upload the RFP 3) Run agents — stage 6 drafts the contract."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setView("projects")}>
              {ar ? "المشاريع" : "Projects"}
            </Button>
            <Button size="sm" onClick={() => setView("agents")}>
              {ar ? "الوكلاء" : "Agents"}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3">
          {contracts.map((c) => (
            <Card
              key={c.id}
              className="p-4 border-border/60 flex flex-wrap items-center justify-between gap-3 hover:border-teal-500/30 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate">
                    {ar ? c.titleAr || c.title : c.title}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {c.status}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-teal-500/10 text-teal-700 dark:text-teal-300"
                  >
                    EN | AR
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  v{c.version}
                  {c.project?.title ? ` · ${c.project.title}` : ""}
                  {c.generatedAt
                    ? ` · ${new Date(c.generatedAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpenId(c.id)}>
                  <Eye className="size-3.5" />
                  {ar ? "معاينة" : "Preview"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  disabled={busyFormat === "html"}
                  onClick={() =>
                    void download({
                      proposalId: c.id,
                      format: "html",
                      fallbackName: "Contract.html",
                      locale,
                    })
                  }
                >
                  <Download className="size-3.5" />
                  HTML
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  disabled={busyFormat === "pdf"}
                  onClick={() =>
                    void download({
                      proposalId: c.id,
                      format: "pdf",
                      fallbackName: "Contract.pdf",
                      locale,
                    })
                  }
                >
                  <FileDown className="size-3.5" />
                  PDF
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(openId)} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b border-border/60">
            <DialogTitle>
              {active ? active.titleAr || active.title : "Contract"}
            </DialogTitle>
          </DialogHeader>
          {active ? (
            <Tabs defaultValue="studio" className="flex-1 min-h-0 flex flex-col">
              <div className="px-5 pt-3">
                <TabsList>
                  <TabsTrigger value="studio">
                    {ar ? "الاستوديو" : "Studio"}
                  </TabsTrigger>
                  <TabsTrigger value="export">
                    {ar ? "معاينة PDF" : "PDF preview"}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent
                value="studio"
                className="flex-1 min-h-0 overflow-auto px-0 pb-0 mt-0 data-[state=inactive]:hidden"
              >
                <BilingualContractStudio
                  title={active.title}
                  titleAr={active.titleAr}
                  contentMd={active.contentMd || ""}
                  research={artifacts.research}
                  articles={artifacts.articles}
                />
              </TabsContent>
              <TabsContent
                value="export"
                className="flex-1 min-h-0 overflow-auto p-4 mt-0 data-[state=inactive]:hidden"
              >
                <DocumentPreviewFrame
                  locale={locale}
                  proposalId={active.id}
                  title={active.titleAr || active.title}
                  defaultMode="html"
                />
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
