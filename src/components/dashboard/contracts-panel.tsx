"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale, Loader2, FileText, Sparkles } from "lucide-react";
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
import { tr } from "@/lib/i18n";
import { apiJson } from "@/lib/api-client";
import type { ApiProposal } from "@/lib/api-types";
import { BilingualContractStudio } from "./contract-studio";
import type { ContractArticle } from "@/lib/contract-format";
import type { SaudiLawResearchBrief } from "@/lib/saudi-law-research";

function parseArtifacts(raw: string | null | undefined): {
  research?: SaudiLawResearchBrief;
  articles?: ContractArticle[];
} {
  if (!raw) return {};
  try {
    const arr = JSON.parse(raw);
    const first = Array.isArray(arr) ? arr[0] : arr;
    if (!first || typeof first !== "object") return {};
    return {
      research: first.research,
      articles: first.articles,
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

  const { data, isLoading } = useQuery({
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
                  ? "وكيل القانون يبحث سجل الأطر السعودية ثم يصوغ عقداً عربي/إنجليزي متقابلاً — للمراجعة القانونية المعتمدة فقط، دون ادعاء يقين 100%."
                  : "The Law agent researches the Saudi framework registry, then drafts a front-to-front AR/EN contract — for authorized counsel review only, never 100% legal certainty."}
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
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {tr("loading", locale)}
        </div>
      ) : contracts.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <FileText className="size-8 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {ar
              ? "لا مسودات عقود بعد. شغّل خط الوكلاء على مشروع نشط — المرحلة السادسة (القانون والعقود) تُنشئ المسودة بعد البحث."
              : "No contract drafts yet. Run the agent pipeline on an active project — stage 6 (Law & Contract) drafts after research."}
          </p>
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
              <Button size="sm" variant="outline" onClick={() => setOpenId(c.id)}>
                {ar ? "عرض العقد" : "Open contract"}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(openId)} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden p-0 border-0 bg-transparent shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {active ? active.titleAr || active.title : "Contract"}
            </DialogTitle>
          </DialogHeader>
          {active ? (
            <BilingualContractStudio
              title={active.title}
              titleAr={active.titleAr}
              contentMd={active.contentMd || ""}
              research={artifacts.research}
              articles={artifacts.articles}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
