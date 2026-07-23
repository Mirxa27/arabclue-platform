"use client";

import { useLocale, useUI } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, XCircle, Inbox, Pencil } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ProposalEditorDialog } from "./proposal-editor";
import { BilingualContractStudio } from "./contract-studio";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiJson } from "@/lib/api-client";
import type { ApiProposal, ApiProposalReview } from "@/lib/api-types";
import type { ContractArticle } from "@/lib/contract-format";
import type { SaudiLawResearchBrief } from "@/lib/saudi-law-research";

function parseContractArtifacts(raw: string | null | undefined): {
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

export function ReviewsQueue() {
  const { locale } = useLocale();
  const { setView } = useUI();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["reviews"],
    queryFn: async () => {
      const res = await fetch("/api/reviews");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const decide = useMutation({
    mutationFn: async (opts: {
      id: string;
      status: "APPROVED" | "REJECTED";
    }) => {
      const res = await fetch(`/api/reviews/${opts.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: opts.status,
          comment: comments[opts.id] ?? null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast({
        title: locale === "ar" ? "تم تسجيل القرار" : "Decision recorded",
      });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const {
    data: contractData,
    isFetching: isContractFetching,
  } = useQuery({
    queryKey: ["proposal", contractId],
    enabled: Boolean(contractId),
    queryFn: () => {
      if (!contractId) throw new Error("Missing contract id");
      return apiJson<{ proposal: ApiProposal }>(`/api/proposals/${contractId}`);
    },
  });
  const activeContract = contractData?.proposal ?? null;
  const contractArtifacts = parseContractArtifacts(activeContract?.artifactsJson);

  return (
    <>
      <Panel
        icon={Inbox}
        title={locale === "ar" ? "قائمة المراجعات" : "Reviews queue"}
        subtitle={
          locale === "ar"
            ? "العروض بانتظار قرارك"
            : "Proposals awaiting your decision"
        }
      >
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (data?.items ?? []).length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {locale === "ar"
              ? "لا توجد مراجعات معلقة."
              : "No pending reviews."}
          </p>
        ) : (
          <ul className="divide-y">
            {(data?.items ?? []).map((r: ApiProposalReview) => {
              if (!r.proposal) return null;
              const isContract = r.proposal.type === "CONTRACT";
              return (
                <li key={r.id} className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">
                      {locale === "ar"
                        ? r.proposal.titleAr || r.proposal.title
                        : r.proposal.title}
                    </span>
                    {isContract ? (
                      <Badge
                        variant="secondary"
                        className="bg-teal-500/10 text-teal-700 dark:text-teal-300"
                      >
                        {locale === "ar" ? "عقد" : "Contract"}
                      </Badge>
                    ) : null}
                    <Badge variant="outline">
                      Step {r.stepIndex + 1} · {r.stepRole}
                    </Badge>
                    {r.proposal.project?.title && (
                      <span className="text-xs text-muted-foreground">
                        {r.proposal.project.title}
                      </span>
                    )}
                  </div>
                  <Textarea
                    placeholder={
                      locale === "ar"
                        ? "تعليق (اختياري)"
                        : "Comment (optional)"
                    }
                    value={comments[r.id] ?? ""}
                    onChange={(e) =>
                      setComments((c) => ({ ...c, [r.id]: e.target.value }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (isContract) {
                          setContractId(r.proposal?.id ?? null);
                        } else {
                          setEditId(r.proposal?.id ?? null);
                          setView("proposals");
                        }
                      }}
                    >
                      <Pencil className="size-4 me-1" />
                      {isContract
                        ? locale === "ar"
                          ? "فتح استوديو العقد"
                          : "Open contract studio"
                        : locale === "ar"
                          ? "فتح الاستوديو"
                          : "Open studio"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        decide.mutate({ id: r.id, status: "APPROVED" })
                      }
                      disabled={decide.isPending}
                    >
                      <CheckCircle2 className="size-4 me-1" />
                      {locale === "ar" ? "اعتماد" : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        decide.mutate({ id: r.id, status: "REJECTED" })
                      }
                      disabled={decide.isPending}
                    >
                      <XCircle className="size-4 me-1" />
                      {locale === "ar" ? "رفض" : "Reject"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {editId && (
        <ProposalEditorDialog
          proposalId={editId}
          open={!!editId}
          onOpenChange={(o) => {
            if (!o) setEditId(null);
          }}
        />
      )}

      <Dialog
        open={Boolean(contractId)}
        onOpenChange={(open) => {
          if (!open) setContractId(null);
        }}
      >
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-auto p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b border-border/60">
            <DialogTitle className="flex items-center gap-2">
              <span>
                {activeContract
                  ? activeContract.titleAr || activeContract.title
                  : locale === "ar"
                    ? "العقد"
                    : "Contract"}
              </span>
              {isContractFetching ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : null}
            </DialogTitle>
          </DialogHeader>
          {activeContract ? (
            <div className="p-4">
              <BilingualContractStudio
                title={activeContract.title}
                titleAr={activeContract.titleAr}
                contentMd={activeContract.contentMd || ""}
                proposalId={activeContract.id}
                status={activeContract.status}
                version={activeContract.version}
                versions={activeContract.versions ?? []}
                research={contractArtifacts.research}
                articles={contractArtifacts.articles}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["proposals"] });
                  qc.invalidateQueries({ queryKey: ["proposal", contractId] });
                }}
              />
            </div>
          ) : (
            <div className="p-8 flex justify-center">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
