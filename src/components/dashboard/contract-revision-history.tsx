"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { GitCompare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tr } from "@/lib/i18n";
import { apiJson } from "@/lib/api-client";
import { ErrorState } from "@/components/patterns";

type ContractVersionSummary = {
  id: string;
  revision: number;
  canonicalHash: string;
  createdBy: string;
  createdAt: string;
};

type VersionsResponse = {
  versions: ContractVersionSummary[];
  nextCursor: string | null;
};

type CompareResponse = {
  comparison: {
    contractId: string;
    revisionA: number;
    revisionB: number;
    arabic: Array<{ articleKey: string; change: string }>;
    english: Array<{ articleKey: string; change: string }>;
  };
};

export function ContractRevisionHistory({
  contractId,
  locale,
}: {
  contractId: string;
  locale: "ar" | "en";
}) {
  const ar = locale === "ar";
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);

  const versionsQuery = useInfiniteQuery({
    queryKey: ["contract-revisions", contractId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ take: "20" });
      if (pageParam) params.set("cursor", pageParam);
      return apiJson<VersionsResponse>(
        `/api/contracts/instances/${encodeURIComponent(contractId)}/versions?${params}`
      );
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const versions = useMemo(
    () => versionsQuery.data?.pages.flatMap((page) => page.versions) ?? [],
    [versionsQuery.data]
  );

  const compareEnabled =
    compareA !== null && compareB !== null && compareA !== compareB;

  const compareQuery = useQuery({
    queryKey: ["contract-revision-compare", contractId, compareA, compareB],
    enabled: compareEnabled,
    queryFn: () =>
      apiJson<CompareResponse>(
        `/api/contracts/instances/${encodeURIComponent(contractId)}/versions/compare?a=${compareA}&b=${compareB}`
      ),
  });

  if (versionsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
        <Loader2 className="size-4 animate-spin" />
        {tr("loading", locale)}
      </div>
    );
  }

  if (versionsQuery.isError) {
    return (
      <ErrorState
        message={(versionsQuery.error as Error).message}
        onRetry={() => void versionsQuery.refetch()}
        retryLabel={locale === "ar" ? "إعادة المحاولة" : "Retry"}
      />
    );
  }

  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {tr("contract_history_empty", locale)}
      </p>
    );
  }

  const comparison = compareQuery.data?.comparison;
  const changedCount = comparison
    ? [...comparison.arabic, ...comparison.english].filter(
        (entry) => entry.change !== "unchanged"
      ).length
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">
          {tr("contract_versions_title", locale)}
        </h4>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={!compareEnabled || compareQuery.isFetching}
          onClick={() => void compareQuery.refetch()}
        >
          {compareQuery.isFetching ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <GitCompare className="size-3.5" />
          )}
          {ar ? "مقارنة" : "Compare"}
        </Button>
      </div>

      <ul className="space-y-1.5">
        {versions.map((version) => (
          <li
            key={version.id}
            className="rounded-lg border px-3 py-2 text-xs space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {tr("contract_revision_number", locale, {
                  revision: String(version.revision),
                })}
              </span>
              <Badge variant="outline" className="text-[9px] font-mono">
                {version.canonicalHash.slice(0, 14) || "—"}
              </Badge>
            </div>
            <div className="text-muted-foreground">
              {tr("contract_revision_author", locale, {
                author: version.createdBy,
              })}
            </div>
            <div className="text-muted-foreground">
              {tr("contract_revision_created_at", locale, {
                timestamp: new Date(version.createdAt).toLocaleString(
                  ar ? "ar-SA" : "en-US"
                ),
              })}
            </div>
            <div className="flex gap-3 pt-1">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`compare-a-${contractId}`}
                  checked={compareA === version.revision}
                  onChange={() => setCompareA(version.revision)}
                />
                {tr("contract_compare_from", locale)}
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`compare-b-${contractId}`}
                  checked={compareB === version.revision}
                  onChange={() => setCompareB(version.revision)}
                />
                {tr("contract_compare_to", locale)}
              </label>
            </div>
          </li>
        ))}
      </ul>

      {versionsQuery.hasNextPage && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full"
          disabled={versionsQuery.isFetchingNextPage}
          onClick={() => void versionsQuery.fetchNextPage()}
        >
          {versionsQuery.isFetchingNextPage ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : ar ? (
            "تحميل المزيد"
          ) : (
            "Load more"
          )}
        </Button>
      )}

      {comparison && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs space-y-1">
          <div className="font-medium">
            {ar ? "نتيجة المقارنة" : "Comparison result"}
          </div>
          <div>
            {changedCount === 0
              ? ar
                ? "المراجعتان متطابقتان"
                : "Revisions are identical"
              : ar
                ? `${changedCount} اختلاف في المواد`
                : `${changedCount} article change(s)`}
          </div>
          <div className="text-muted-foreground">
            r{comparison.revisionA} ↔ r{comparison.revisionB}
          </div>
        </div>
      )}
    </div>
  );
}
