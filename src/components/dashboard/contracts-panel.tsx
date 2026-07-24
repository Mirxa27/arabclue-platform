"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Scale,
  FileText,
  Sparkles,
  ClipboardCheck,
  Download,
  FileDown,
  Eye,
  Loader2,
  Send,
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
import {
  BilingualContractStudio,
  type ContractStudioMode,
} from "./contract-studio";
import { DocumentPreviewFrame } from "./document-preview-frame";
import { EmptyState, QueryState } from "@/components/patterns";
import { ListSkeleton } from "./loading-skeletons";
import { useArtifactDownload } from "@/hooks/use-artifact-download";
import { parseContractArtifacts } from "@/lib/contract-artifacts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

export function ContractsPanel() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { activeProjectId, setView } = useUI();
  const [openId, setOpenId] = useState<string | null>(null);
  const [openStudioMode, setOpenStudioMode] =
    useState<ContractStudioMode>("preview");
  const { download, busyFormat } = useArtifactDownload();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError, error, refetch } = useQuery({
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

  const activeListItem = contracts.find((c) => c.id === openId) ?? null;
  const { data: activeData, isFetching: isActiveFetching } = useQuery({
    queryKey: ["proposal", openId],
    enabled: Boolean(openId),
    queryFn: () => {
      if (!openId) throw new Error("Missing contract id");
      return apiJson<{ proposal: ApiProposal }>(`/api/proposals/${openId}`);
    },
  });
  const active = activeData?.proposal ?? activeListItem;
  const artifacts = parseContractArtifacts(active?.artifactsJson);

  const submitForReview = useMutation({
    mutationFn: async (proposalId: string) => {
      const res = await fetch(`/api/proposals/${proposalId}/submit`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Submit failed");
      return json as { proposal?: ApiProposal };
    },
    onSuccess: (json) => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      if (json.proposal?.id) {
        qc.invalidateQueries({ queryKey: ["proposal", json.proposal.id] });
      }
      qc.invalidateQueries({ queryKey: ["reviews"] });
      toast({
        title: ar ? "أُرسل العقد للمراجعة القانونية" : "Contract sent for legal review",
      });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

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

      <QueryState
        isLoading={isLoading}
        isError={isError}
        errorMessage={
          error instanceof Error
            ? error.message
            : ar
              ? "تعذّر تحميل العقود"
              : "Could not load contracts"
        }
        isEmpty={contracts.length === 0}
        onRetry={() => void refetch()}
        locale={locale}
        loading={<ListSkeleton rows={3} />}
        empty={
          <Card className="border-dashed">
            <EmptyState
              icon={FileText}
              title={
                ar ? "لا مسودات عقود بعد" : "No contract drafts yet"
              }
              description={
                ar
                  ? "1) أنشئ مناقصة 2) ارفع الكراسة 3) شغّل الوكلاء — المرحلة 6 تصوغ العقد."
                  : "1) Set up a tender 2) Upload the RFP 3) Run agents — stage 6 drafts the contract."
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setView("projects")}>
                    {ar ? "المشاريع" : "Projects"}
                  </Button>
                  <Button size="sm" onClick={() => setView("agents")}>
                    {ar ? "الوكلاء" : "Agents"}
                  </Button>
                </div>
              }
              className="max-w-md mx-auto"
            />
          </Card>
        }
      >
        <div className="grid gap-3">
          {contracts.map((c) => {
            const canSubmit = ![
              "IN_REVIEW",
              "REVIEW",
              "REVIEWED",
              "APPROVED",
              "EXPORTED",
            ].includes(c.status);
            return (
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => {
                      setOpenStudioMode("preview");
                      setOpenId(c.id);
                    }}
                  >
                    <Eye className="size-3.5" />
                    {ar ? "معاينة" : "Preview"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => {
                      setOpenStudioMode("obligations");
                      setOpenId(c.id);
                    }}
                  >
                    <ClipboardCheck className="size-3.5" />
                    {ar ? "الالتزامات" : "Obligations"}
                  </Button>
                  {canSubmit ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1"
                      disabled={submitForReview.isPending}
                      onClick={() => submitForReview.mutate(c.id)}
                    >
                      {submitForReview.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Send className="size-3.5" />
                      )}
                      {ar
                        ? "إرسال للمراجعة القانونية"
                        : "Submit for legal review"}
                    </Button>
                  ) : null}
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
            );
          })}
        </div>
      </QueryState>

      <Dialog open={Boolean(openId)} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b border-border/60">
            <DialogTitle className="flex items-center gap-2">
              <span>{active ? active.titleAr || active.title : "Contract"}</span>
              {isActiveFetching ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : null}
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
                  proposalId={active.id}
                  status={active.status}
                  version={active.version}
                  versions={active.versions ?? []}
                  research={artifacts.research}
                  articles={artifacts.articles}
                  milestones={artifacts.milestones}
                  initialMode={openStudioMode}
                  onSaved={() => void refetch()}
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
