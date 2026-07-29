"use client";

import { startTransition, useCallback, useMemo, useState } from "react";
import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  History,
  GitBranch,
  Loader2,
  RotateCcw,
  FileText,
  FileSpreadsheet,
  FileArchive,
  GitCompare,
  ChevronDown,
  FileSignature,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ApiDocument, ApiDocumentVersion, ApiProposal, ApiProposalVersion } from "@/lib/api-types";
import { EmptyState, QueryState } from "@/components/patterns";
import { ListSkeleton } from "./loading-skeletons";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type DocumentVersionWithAuthor = ApiDocumentVersion & {
  author?: { name: string; email: string } | null;
};

type ProposalVersionWithAuthor = ApiProposalVersion & {
  author?: { name: string; email: string } | null;
};

type VersionsResponse<T> = {
  versions: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

// Document version item with load-more support
function DocumentVersionItem({
  doc,
  locale,
  expanded,
  onCompare,
  onRevert,
  isReverting,
}: {
  doc: ApiDocument;
  locale: "ar" | "en";
  expanded: boolean;
  onCompare: (docId: string, a: number, b: number) => void;
  onRevert: (docId: string, version: number) => void;
  isReverting: boolean;
}) {
  // Compute icon outside of JSX to avoid creating during render
  const iconName = doc.originalName.endsWith(".xlsx") || doc.originalName.endsWith(".xls")
    ? "spreadsheet"
    : doc.originalName.endsWith(".zip")
      ? "archive"
      : "text";

  // Use infinite query for paginated version loading when expanded
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: versionsLoading,
  } = useInfiniteQuery({
    queryKey: ["document-versions", doc.id],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      const res = await fetch(`/api/documents/${doc.id}/versions?${params}`);
      if (!res.ok) throw new Error("Failed to load versions");
      return res.json() as Promise<VersionsResponse<DocumentVersionWithAuthor>>;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    enabled: expanded,
  });

  const versions = useMemo(() => {
    if (!expanded || !data) {
      // Fallback to inline versions or a current placeholder
      const inline = doc.versions ?? [];
      if (inline.length) return inline.slice(0, 3);
      return [
        {
          id: `${doc.id}-current`,
          version: doc.currentVersion ?? 1,
          changeLog: "Current",
          sizeBytes: doc.sizeBytes,
          createdAt: doc.createdAt,
        },
      ];
    }
    return data.pages.flatMap((p) => p.versions);
  }, [data, doc, expanded]);

  return (
    <div className="relative ps-6">
      <div className="absolute start-2 top-2 bottom-0 w-px bg-border" />
      <div className="absolute start-0 top-1 size-4 rounded-full bg-card border-2 border-primary flex items-center justify-center">
        <div className="size-1.5 rounded-full bg-primary" />
      </div>
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-0.5">
          {iconName === "spreadsheet" ? (
            <FileSpreadsheet className="size-3.5 text-muted-foreground shrink-0" />
          ) : iconName === "archive" ? (
            <FileArchive className="size-3.5 text-muted-foreground shrink-0" />
          ) : (
            <FileText className="size-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-xs font-semibold truncate">{doc.originalName}</span>
          <Badge variant="outline" className="text-[9px] font-mono shrink-0">
            v{doc.currentVersion ?? 1}
          </Badge>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {tr(`cat_${doc.docCategory}` as Parameters<typeof tr>[0], locale)} ·{" "}
          {formatBytes(doc.sizeBytes)}
        </div>
      </div>
      <div className="space-y-1.5">
        {versionsLoading && expanded ? (
          <div className="flex items-center gap-2 py-2 ps-3 text-[10px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : (
          <>
            {versions.map((v, i) => (
              <div
                key={`${doc.id}-${v.version}-${i}`}
                className="flex items-center justify-between gap-2 ps-3 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] font-mono shrink-0",
                      v.version === doc.currentVersion &&
                        "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    )}
                  >
                    v{v.version}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {v.changeLog ??
                      (v.version === doc.currentVersion
                        ? tr("version_current", locale)
                        : tr("version_previous", locale))}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {versions.length > 1 && i === 0 && versions[1] && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 px-2"
                      onClick={() =>
                        onCompare(doc.id, versions[1].version, versions[0].version)
                      }
                    >
                      <GitCompare className="size-2.5" />
                      {tr("action_compare", locale)}
                    </Button>
                  )}
                  {v.version !== doc.currentVersion && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 px-2 hover:text-primary"
                      disabled={isReverting}
                      onClick={() => onRevert(doc.id, v.version)}
                    >
                      <RotateCcw className="size-2.5" />
                      {tr("action_revert", locale)}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {expanded && hasNextPage && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-[10px] h-7 gap-1"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
                {tr("version_load_more", locale)}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Proposal version item with load-more support
function ProposalVersionItem({
  proposal,
  locale,
  expanded,
  onCompare,
  onRevert,
  isReverting,
}: {
  proposal: ApiProposal;
  locale: "ar" | "en";
  expanded: boolean;
  onCompare: (proposalId: string, a: number, b: number) => void;
  onRevert: (proposalId: string, version: number) => void;
  isReverting: boolean;
}) {
  // Use infinite query for paginated version loading when expanded
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: versionsLoading,
  } = useInfiniteQuery({
    queryKey: ["proposal-versions", proposal.id],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      const res = await fetch(`/api/proposals/${proposal.id}/versions?${params}`);
      if (!res.ok) throw new Error("Failed to load versions");
      return res.json() as Promise<VersionsResponse<ProposalVersionWithAuthor>>;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    enabled: expanded,
  });

  const versions = useMemo(() => {
    if (!expanded || !data) {
      // Fallback to inline versions or a current placeholder
      const inline = proposal.versions ?? [];
      if (inline.length) return inline.slice(0, 3);
      return [
        {
          id: `${proposal.id}-current`,
          version: proposal.version ?? 1,
          changeLog: "Current",
          createdAt: proposal.createdAt,
        },
      ];
    }
    return data.pages.flatMap((p) => p.versions);
  }, [data, proposal, expanded]);

  return (
    <div className="relative ps-6">
      <div className="absolute start-2 top-2 bottom-0 w-px bg-border" />
      <div className="absolute start-0 top-1 size-4 rounded-full bg-card border-2 border-chart-2 flex items-center justify-center">
        <div className="size-1.5 rounded-full bg-chart-2" />
      </div>
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-0.5">
          <FileSignature className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold truncate">
            {locale === "ar" ? proposal.titleAr || proposal.title : proposal.title}
          </span>
          <Badge variant="outline" className="text-[9px] font-mono shrink-0">
            v{proposal.version ?? 1}
          </Badge>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {tr(`status_${proposal.status}` as Parameters<typeof tr>[0], locale)}
        </div>
      </div>
      <div className="space-y-1.5">
        {versionsLoading && expanded ? (
          <div className="flex items-center gap-2 py-2 ps-3 text-[10px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : (
          <>
            {versions.map((v, i) => (
              <div
                key={`${proposal.id}-${v.version}-${i}`}
                className="flex items-center justify-between gap-2 ps-3 py-1.5 rounded-md hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] font-mono shrink-0",
                      v.version === proposal.version &&
                        "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    )}
                  >
                    v{v.version}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {v.changeLog ??
                      (v.version === proposal.version
                        ? tr("version_current", locale)
                        : tr("version_previous", locale))}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {versions.length > 1 && i === 0 && versions[1] && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 px-2"
                      onClick={() =>
                        onCompare(proposal.id, versions[1].version, versions[0].version)
                      }
                    >
                      <GitCompare className="size-2.5" />
                      {tr("action_compare", locale)}
                    </Button>
                  )}
                  {v.version !== proposal.version && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 px-2 hover:text-primary"
                      disabled={isReverting}
                      onClick={() => onRevert(proposal.id, v.version)}
                    >
                      <RotateCcw className="size-2.5" />
                      {tr("action_revert", locale)}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {expanded && hasNextPage && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-[10px] h-7 gap-1"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
                {tr("version_load_more", locale)}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function VersionHistory() {
  const { locale } = useLocale();
  const { setView } = useUI();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"documents" | "proposals">("documents");
  const [compare, setCompare] = useState<{
    type: "document" | "proposal";
    id: string;
    a: number;
    b: number;
  } | null>(null);

  // Documents query
  const {
    data: docsData,
    isLoading: docsLoading,
    isError: docsError,
    error: docsErrorObj,
    refetch: docsRefetch,
  } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json() as Promise<{ documents: ApiDocument[] }>;
    },
  });

  // Proposals query
  const {
    data: proposalsData,
    isLoading: proposalsLoading,
    isError: proposalsError,
    error: proposalsErrorObj,
    refetch: proposalsRefetch,
  } = useQuery({
    queryKey: ["proposals"],
    queryFn: async () => {
      const res = await fetch("/api/proposals");
      if (!res.ok) throw new Error("Failed to load proposals");
      return res.json() as Promise<{ proposals: ApiProposal[] }>;
    },
    enabled: activeTab === "proposals" || expanded,
  });

  const docs = useMemo(() => {
    const all = docsData?.documents ?? [];
    const filtered = all.filter((d) =>
      search ? d.originalName.toLowerCase().includes(search.toLowerCase()) : true
    );
    return expanded ? filtered : filtered.slice(0, 6);
  }, [docsData, search, expanded]);

  const proposals = useMemo(() => {
    const all = proposalsData?.proposals ?? [];
    const filtered = all.filter((p) =>
      search
        ? (p.title.toLowerCase().includes(search.toLowerCase()) ||
            p.titleAr?.toLowerCase().includes(search.toLowerCase()))
        : true
    );
    return expanded ? filtered : filtered.slice(0, 6);
  }, [proposalsData, search, expanded]);

  const versionHistoryEmpty = (
    <EmptyState
      icon={History}
      title={tr("version_history_empty_title", locale)}
      description={tr("version_history_empty_description", locale)}
      action={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => startTransition(() => setView("documents"))}>
            {tr("nav_documents", locale)}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => startTransition(() => setView("proposals"))}
          >
            {tr("nav_proposals", locale)}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => startTransition(() => setView("agents"))}
          >
            {tr("nav_agents", locale)}
          </Button>
        </div>
      }
    />
  );

  // Compare query (supports both docs and proposals)
  const { data: compareData, isLoading: compareLoading } = useQuery({
    queryKey: ["version-compare", compare?.type, compare?.id, compare?.a, compare?.b],
    enabled: !!compare,
    queryFn: async () => {
      const base =
        compare!.type === "document"
          ? `/api/documents/${compare!.id}/versions/compare`
          : `/api/proposals/${compare!.id}/versions/compare`;
      const res = await fetch(`${base}?a=${compare!.a}&b=${compare!.b}`);
      if (!res.ok) throw new Error("Compare failed");
      return res.json();
    },
  });

  // Document revert mutation
  const docRevertMutation = useMutation({
    mutationFn: async ({ docId, version }: { docId: string; version: number }) => {
      const res = await fetch(`/api/documents/${docId}/versions/${version}/revert`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "revert failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["document-versions"] });
      toast({ title: tr("version_reverted", locale) });
    },
    onError: (e: Error) => {
      toast({
        title: tr("version_revert_failed", locale),
        description: e.message,
        variant: "destructive",
      });
    },
  });

  // Proposal revert mutation
  const proposalRevertMutation = useMutation({
    mutationFn: async ({ proposalId, version }: { proposalId: string; version: number }) => {
      const res = await fetch(`/api/proposals/${proposalId}/versions/${version}/revert`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "revert failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal-versions"] });
      toast({ title: tr("version_reverted", locale) });
    },
    onError: (e: Error) => {
      toast({
        title: tr("version_revert_failed", locale),
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const handleDocCompare = useCallback((docId: string, a: number, b: number) => {
    setCompare({ type: "document", id: docId, a, b });
  }, []);

  const handleProposalCompare = useCallback((proposalId: string, a: number, b: number) => {
    setCompare({ type: "proposal", id: proposalId, a, b });
  }, []);

  const handleDocRevert = useCallback(
    (docId: string, version: number) => {
      docRevertMutation.mutate({ docId, version });
    },
    [docRevertMutation]
  );

  const handleProposalRevert = useCallback(
    (proposalId: string, version: number) => {
      proposalRevertMutation.mutate({ proposalId, version });
    },
    [proposalRevertMutation]
  );

  const isLoading = activeTab === "documents" ? docsLoading : proposalsLoading;
  const isError = activeTab === "documents" ? docsError : proposalsError;
  const errorObj = activeTab === "documents" ? docsErrorObj : proposalsErrorObj;
  const refetch = activeTab === "documents" ? docsRefetch : proposalsRefetch;
  const items = activeTab === "documents" ? docs : proposals;

  return (
    <Card className="p-0 overflow-hidden border-border/60 h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-chart-4/10 flex items-center justify-center">
            <History className="size-4 text-chart-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("section_versions", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {tr("version_history_subtitle", locale)}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-[11px] gap-1"
          onClick={() => setExpanded((v) => !v)}
        >
          <GitBranch className="size-3" />
          {expanded ? tr("version_collapse", locale) : tr("version_all", locale)}
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "documents" | "proposals")}
        className="w-full"
      >
        <div className="px-4 pt-3 flex items-center gap-3">
          <TabsList className="h-7">
            <TabsTrigger value="documents" className="text-[10px] h-6 px-2.5">
              {tr("nav_documents", locale)}
            </TabsTrigger>
            <TabsTrigger value="proposals" className="text-[10px] h-6 px-2.5">
              {tr("nav_proposals", locale)}
            </TabsTrigger>
          </TabsList>
          {expanded && (
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("version_search_placeholder", locale)}
              className="h-7 text-xs flex-1"
            />
          )}
        </div>

        <ScrollArea className="max-h-96">
          <TabsContent value="documents" className="mt-0">
            <QueryState
              isLoading={docsLoading}
              isError={docsError}
              errorMessage={
                docsErrorObj instanceof Error
                  ? docsErrorObj.message
                  : tr("version_load_failed", locale)
              }
              isEmpty={docs.length === 0}
              onRetry={() => docsRefetch()}
              locale={locale}
              loading={<ListSkeleton rows={3} />}
              empty={versionHistoryEmpty}
            >
              <div className="p-4 space-y-4">
                {docs.map((d) => (
                  <DocumentVersionItem
                    key={d.id}
                    doc={d}
                    locale={locale}
                    expanded={expanded}
                    onCompare={handleDocCompare}
                    onRevert={handleDocRevert}
                    isReverting={docRevertMutation.isPending}
                  />
                ))}
              </div>
            </QueryState>
          </TabsContent>

          <TabsContent value="proposals" className="mt-0">
            <QueryState
              isLoading={proposalsLoading}
              isError={proposalsError}
              errorMessage={
                proposalsErrorObj instanceof Error
                  ? proposalsErrorObj.message
                  : tr("version_load_failed", locale)
              }
              isEmpty={proposals.length === 0}
              onRetry={() => proposalsRefetch()}
              locale={locale}
              loading={<ListSkeleton rows={3} />}
              empty={versionHistoryEmpty}
            >
              <div className="p-4 space-y-4">
                {proposals.map((p) => (
                  <ProposalVersionItem
                    key={p.id}
                    proposal={p}
                    locale={locale}
                    expanded={expanded}
                    onCompare={handleProposalCompare}
                    onRevert={handleProposalRevert}
                    isReverting={proposalRevertMutation.isPending}
                  />
                ))}
              </div>
            </QueryState>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      <Dialog open={!!compare} onOpenChange={(o) => !o && setCompare(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {tr("action_compare", locale)} v{compare?.a} → v{compare?.b}
            </DialogTitle>
          </DialogHeader>
          {compareLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
              <Loader2 className="size-4 animate-spin" />
              {tr("loading", locale)}
            </div>
          ) : (
            <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted/40 rounded-md p-3 border border-border/60">
              {compare?.type === "document"
                ? (compareData?.summaryDiff ?? []).join("\n") ||
                  tr("version_no_diff", locale)
                : compareData?.contentDiff ||
                  tr("version_no_diff", locale)}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
