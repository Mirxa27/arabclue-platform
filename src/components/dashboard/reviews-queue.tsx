"use client";

import { useLocale, useUI } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EmptyState, Panel, QueryState } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, GitCompare, Loader2, XCircle, Inbox, Pencil } from "lucide-react";
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
import { parseContractArtifacts } from "@/lib/contract-artifacts";

const REDLINE_LINE_LIMIT = 200;

type ReviewsResponse = {
  items: ApiProposalReview[];
};

type ProposalCompareResponse = {
  contentDiff?: string[];
  lines?: string[];
};

type RedlineEntry = {
  from?: number;
  to?: number;
  lines?: string[];
  message?: string;
  isError?: boolean;
};

export function ReviewsQueue() {
  const { locale } = useLocale();
  const { setView } = useUI();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [redlines, setRedlines] = useState<Record<string, RedlineEntry>>({});

  const { data, isLoading, isError, error, refetch } = useQuery<ReviewsResponse>({
    queryKey: ["reviews"],
    queryFn: () => apiJson<ReviewsResponse>("/api/reviews"),
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

  const redlineMutation = useMutation({
    mutationFn: async ({
      reviewId,
      proposalId,
    }: {
      reviewId: string;
      proposalId: string;
    }) => {
      const { proposal } = await apiJson<{ proposal: ApiProposal }>(
        `/api/proposals/${proposalId}`
      );
      const version = proposal.version ?? 1;

      if (version < 2) {
        return {
          reviewId,
          message:
            locale === "ar"
              ? "لا توجد نسخة سابقة للمقارنة."
              : "No previous version to compare.",
        };
      }

      const compare = await apiJson<ProposalCompareResponse>(
        `/api/proposals/${proposalId}/versions/compare?a=${version - 1}&b=${version}`
      );
      return {
        reviewId,
        from: version - 1,
        to: version,
        lines: compare.contentDiff ?? compare.lines ?? [],
      };
    },
    onSuccess: ({ reviewId, ...entry }) => {
      setRedlines((current) => ({
        ...current,
        [reviewId]: entry,
      }));
    },
    onError: (e: Error, vars) => {
      setRedlines((current) => ({
        ...current,
        [vars.reviewId]: {
          message: e.message,
          isError: true,
        },
      }));
      toast({ title: e.message, variant: "destructive" });
    },
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
  const reviews = data?.items ?? [];

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
        <QueryState
          isLoading={isLoading}
          isError={isError}
          errorMessage={
            error instanceof Error
              ? error.message
              : locale === "ar"
                ? "تعذر تحميل المراجعات"
                : "Failed to load reviews"
          }
          isEmpty={reviews.length === 0}
          onRetry={() => refetch()}
          locale={locale}
          loading={
            <div className="p-8 flex justify-center">
              <Loader2 className="size-5 animate-spin" />
            </div>
          }
          empty={
            <EmptyState
              icon={Inbox}
              title={
                locale === "ar"
                  ? "لا توجد مراجعات معلقة."
                  : "No pending reviews."
              }
            />
          }
        >
          <ul className="divide-y">
            {reviews.map((r: ApiProposalReview) => {
              if (!r.proposal) return null;
              const isContract = r.proposal.type === "CONTRACT";
              const redline = redlines[r.id];
              const isRedlineBusy =
                redlineMutation.isPending &&
                redlineMutation.variables?.reviewId === r.id;
              const redlineLines = redline?.lines ?? [];
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
                      variant="outline"
                      onClick={() => {
                        if (redline) {
                          setRedlines((current) => {
                            const next = { ...current };
                            delete next[r.id];
                            return next;
                          });
                          return;
                        }
                        redlineMutation.mutate({
                          reviewId: r.id,
                          proposalId: r.proposal!.id,
                        });
                      }}
                      disabled={isRedlineBusy}
                    >
                      {isRedlineBusy ? (
                        <Loader2 className="size-4 me-1 animate-spin" />
                      ) : (
                        <GitCompare className="size-4 me-1" />
                      )}
                      {redline
                        ? locale === "ar"
                          ? "إخفاء الفروق"
                          : "Hide redline"
                        : locale === "ar"
                          ? "الفروق"
                          : "Redline"}
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
                  {redline ? (
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium">
                          {locale === "ar" ? "فروق الإصدار" : "Version redline"}
                        </span>
                        {redline.from && redline.to ? (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            v{redline.from} → v{redline.to}
                          </Badge>
                        ) : null}
                      </div>
                      {redlineLines.length > 0 ? (
                        <>
                          <pre className="font-mono text-[10px] whitespace-pre-wrap overflow-auto max-h-64 rounded-md bg-background/80 p-3 border border-border/50">
                            {redlineLines.slice(0, REDLINE_LINE_LIMIT).join("\n")}
                          </pre>
                          {redlineLines.length > REDLINE_LINE_LIMIT ? (
                            <p className="mt-2 text-[10px] text-muted-foreground">
                              {locale === "ar"
                                ? `تم عرض أول ${REDLINE_LINE_LIMIT} سطر فقط.`
                                : `Showing first ${REDLINE_LINE_LIMIT} lines only.`}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p
                          className={
                            redline.isError
                              ? "text-xs text-destructive"
                              : "text-xs text-muted-foreground"
                          }
                        >
                          {redline.message ??
                            (locale === "ar"
                              ? "لا توجد فروق بين الإصدارين."
                              : "No differences between these versions.")}
                        </p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </QueryState>
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
                milestones={contractArtifacts.milestones}
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
