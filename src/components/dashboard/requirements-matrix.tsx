"use client";

import { startTransition } from "react";

import { useLocale, useUI } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Panel, EmptyState, QueryState } from "@/components/patterns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardList, Link2, Unlink } from "lucide-react";
import type { ApiCertificate, ApiStaffMember } from "@/lib/api-types";
import { readApiError } from "@/lib/http-error";
import { useToast } from "@/hooks/use-toast";
import { ListSkeleton } from "./loading-skeletons";

type LinkType =
  | "CERTIFICATE"
  | "STAFF"
  | "LIBRARY"
  | "METHODOLOGY"
  | "PAST_PROJECT"
  | "";

type ReqItem = {
  id: string;
  text: string;
  sectionRef?: string;
  pageRef?: string;
  status: string;
  linkedResourceType?: string | null;
  linkedResourceId?: string | null;
};

const STATUS_LABEL: Record<string, { en: string; ar: string }> = {
  COVERED: { en: "Covered", ar: "مغطى" },
  IN_PROGRESS: { en: "In progress", ar: "قيد الإنجاز" },
  MISSING: { en: "Missing", ar: "غير مغطى" },
};

export function RequirementsMatrix() {
  const { locale } = useLocale();
  const { activeProjectId, setView } = useUI();
  const qc = useQueryClient();
  const { toast } = useToast();
  const ar = locale === "ar";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["requirements", activeProjectId],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${activeProjectId}/requirements`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const {
    data: certsData,
    isError: certsError,
    refetch: refetchCerts,
  } = useQuery({
    queryKey: ["certificates"],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch("/api/certificates");
      if (!res.ok) throw new Error("Failed to load certificates");
      return res.json();
    },
  });

  const {
    data: staffData,
    isError: staffError,
    refetch: refetchStaff,
  } = useQuery({
    queryKey: ["staff"],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch("/api/staff");
      if (!res.ok) throw new Error("Failed to load staff");
      return res.json();
    },
  });

  const {
    data: libraryData,
    isError: libraryError,
    refetch: refetchLibrary,
  } = useQuery({
    queryKey: ["library"],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch("/api/library");
      if (!res.ok) throw new Error("Failed to load library");
      return res.json();
    },
  });

  const {
    data: methodologiesData,
    isError: methodologiesError,
    refetch: refetchMethodologies,
  } = useQuery({
    queryKey: ["methodologies"],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch("/api/methodologies");
      if (!res.ok) throw new Error("Failed to load methodologies");
      return res.json() as Promise<{
        items: { id: string; title: string; titleAr?: string | null }[];
      }>;
    },
  });

  const evidenceUnavailable =
    certsError || staffError || libraryError || methodologiesError;

  const patch = useMutation({
    mutationFn: async (body: {
      id: string;
      status?: string;
      linkedResourceType?: string | null;
      linkedResourceId?: string | null;
    }) => {
      const res = await fetch(`/api/projects/${activeProjectId}/requirements`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(
            res,
            ar ? "تعذر تحديث المتطلب" : "Could not update requirement"
          )
        );
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["requirements", activeProjectId] }),
    onError: (err: Error) => {
      toast({
        title: ar ? "تعذر تحديث المتطلب" : "Could not update requirement",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (!activeProjectId) {
    return (
      <Panel
        icon={ClipboardList}
        title={ar ? "مصفوفة المتطلبات" : "Requirements matrix"}
      >
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {ar
              ? "اختر مشروعاً نشطاً لعرض المتطلبات المستخرجة."
              : "Select an active project to view extracted requirements."}
          </p>
          <Button size="sm" onClick={() => startTransition(() => setView("projects"))}>
            {ar ? "اختيار مشروع" : "Choose a project"}
          </Button>
        </div>
      </Panel>
    );
  }

  const items = (data?.items ?? []) as ReqItem[];
  const summary = data?.summary ?? {
    total: 0,
    COVERED: 0,
    IN_PROGRESS: 0,
    MISSING: 0,
  };
  const certificates = (certsData?.items ?? []) as ApiCertificate[];
  const staff = (staffData?.items ?? []) as ApiStaffMember[];
  const library = (libraryData?.items ?? []) as {
    id: string;
    title: string;
  }[];
  const methodologies = (methodologiesData?.items ?? []) as {
    id: string;
    title: string;
    titleAr?: string | null;
  }[];

  return (
    <Panel
      icon={ClipboardList}
      title={ar ? "مصفوفة المتطلبات" : "Requirements matrix"}
      subtitle={
        ar
          ? `${summary.COVERED} مغطى · ${summary.IN_PROGRESS} قيد الإنجاز · ${summary.MISSING} غير مغطى`
          : `${summary.COVERED} covered · ${summary.IN_PROGRESS} in progress · ${summary.MISSING} missing`
      }
      actions={
        <Button size="sm" variant="outline" onClick={() => startTransition(() => setView("documents"))}>
          {ar ? "المستندات" : "Documents"}
        </Button>
      }
    >
      <QueryState
        isLoading={isLoading}
        isError={isError}
        isEmpty={items.length === 0}
        onRetry={() => refetch()}
        locale={locale}
        loading={<ListSkeleton rows={3} />}
        empty={
          <EmptyState
            icon={ClipboardList}
            title={
              ar
                ? "لا متطلبات مستخرجة بعد"
                : "No requirements extracted yet"
            }
            description={
              ar
                ? "شغّل الوكلاء لاستخراج المتطلبات من كراسة الشروط، ثم اربط الأدلة من حسابك."
                : "Run agents to extract requirements from the RFP, then link evidence from your account."
            }
            action={
              <Button size="sm" onClick={() => startTransition(() => setView("agents"))}>
                {ar ? "الوكلاء" : "Agents"}
              </Button>
            }
          />
        }
      >
        <div className="overflow-x-auto">
          {evidenceUnavailable ? (
            <div
              className="mx-3 mt-3 mb-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100"
              role="status"
            >
              {ar
                ? "تعذر تحميل بعض أدلة الحساب. قوائم الربط قد تكون غير مكتملة."
                : "Some account evidence failed to load. Link dropdowns may be incomplete."}{" "}
              <button
                type="button"
                className="underline underline-offset-2 font-medium"
                onClick={() => {
                  void refetchCerts();
                  void refetchStaff();
                  void refetchLibrary();
                  void refetchMethodologies();
                }}
              >
                {ar ? "إعادة المحاولة" : "Retry"}
              </button>
            </div>
          ) : null}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-muted-foreground">
                <th className="p-3 font-medium">#</th>
                <th className="p-3 font-medium">
                  {ar ? "المتطلب" : "Requirement"}
                </th>
                <th className="p-3 font-medium">{ar ? "المرجع" : "Ref"}</th>
                <th className="p-3 font-medium">{ar ? "الحالة" : "Status"}</th>
                <th className="p-3 font-medium min-w-[220px]">
                  {ar ? "دليل الحساب" : "Account evidence"}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, i) => (
                <tr
                  key={r.id}
                  className="border-b border-border/40 align-top"
                >
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 max-w-md">{r.text}</td>
                  <td className="p-3 whitespace-nowrap text-xs">
                    {r.sectionRef && <div>§{r.sectionRef}</div>}
                    {r.pageRef && <div>p.{r.pageRef}</div>}
                  </td>
                  <td className="p-3">
                    <Select
                      value={r.status}
                      onValueChange={(status) =>
                        patch.mutate({ id: r.id, status })
                      }
                    >
                      <SelectTrigger className="w-[140px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COVERED">
                          {ar ? STATUS_LABEL.COVERED.ar : STATUS_LABEL.COVERED.en}
                        </SelectItem>
                        <SelectItem value="IN_PROGRESS">
                          {ar
                            ? STATUS_LABEL.IN_PROGRESS.ar
                            : STATUS_LABEL.IN_PROGRESS.en}
                        </SelectItem>
                        <SelectItem value="MISSING">
                          {ar ? STATUS_LABEL.MISSING.ar : STATUS_LABEL.MISSING.en}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Select
                        value={(r.linkedResourceType as LinkType) || "none"}
                        onValueChange={(v) => {
                          const linkedResourceType =
                            v === "none" ? null : (v as Exclude<LinkType, "">);
                          patch.mutate({
                            id: r.id,
                            linkedResourceType,
                            linkedResourceId: null,
                            ...(linkedResourceType
                              ? { status: "IN_PROGRESS" }
                              : {}),
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[140px] text-[11px]">
                          <SelectValue
                            placeholder={ar ? "نوع الدليل" : "Evidence type"}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {ar ? "بدون ربط" : "Unlinked"}
                          </SelectItem>
                          <SelectItem value="CERTIFICATE">
                            {ar ? "شهادة" : "Certificate"}
                          </SelectItem>
                          <SelectItem value="STAFF">
                            {ar ? "كادر / سيرة ذاتية" : "Staff / CV"}
                          </SelectItem>
                          <SelectItem value="LIBRARY">
                            {ar ? "مكتبة" : "Library"}
                          </SelectItem>
                          <SelectItem value="METHODOLOGY">
                            {ar ? "منهجية" : "Methodology"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {r.linkedResourceType ? (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Link2 className="size-2.5" />
                          {r.linkedResourceType}
                        </Badge>
                      ) : null}
                      {r.linkedResourceId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          title={ar ? "إلغاء الربط" : "Unlink"}
                          onClick={() =>
                            patch.mutate({
                              id: r.id,
                              linkedResourceType: null,
                              linkedResourceId: null,
                            })
                          }
                        >
                          <Unlink className="size-3" />
                        </Button>
                      ) : null}
                    </div>
                    {r.linkedResourceType === "CERTIFICATE" ? (
                      <Select
                        value={r.linkedResourceId ?? ""}
                        onValueChange={(linkedResourceId) =>
                          patch.mutate({
                            id: r.id,
                            linkedResourceType: "CERTIFICATE",
                            linkedResourceId,
                            status: "COVERED",
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-[11px]">
                          <SelectValue
                            placeholder={
                              ar ? "اختر شهادة" : "Pick certificate"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {certificates.length === 0 ? (
                            <SelectItem value="__none" disabled>
                              {ar
                                ? "أضف شهادات من الحساب"
                                : "Add certificates in Account"}
                            </SelectItem>
                          ) : (
                            certificates.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {r.linkedResourceType === "STAFF" ? (
                      <Select
                        value={r.linkedResourceId ?? ""}
                        onValueChange={(linkedResourceId) =>
                          patch.mutate({
                            id: r.id,
                            linkedResourceType: "STAFF",
                            linkedResourceId,
                            status: "COVERED",
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-[11px]">
                          <SelectValue
                            placeholder={ar ? "اختر موظفاً" : "Pick staff"}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {staff.length === 0 ? (
                            <SelectItem value="__none" disabled>
                              {ar
                                ? "أضف كوادر من الحساب"
                                : "Add staff in Account"}
                            </SelectItem>
                          ) : (
                            staff.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {locale === "ar"
                                  ? s.nameAr ?? s.name
                                  : s.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {r.linkedResourceType === "LIBRARY" ? (
                      <Select
                        value={r.linkedResourceId ?? ""}
                        onValueChange={(linkedResourceId) =>
                          patch.mutate({
                            id: r.id,
                            linkedResourceType: "LIBRARY",
                            linkedResourceId,
                            status: "COVERED",
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-[11px]">
                          <SelectValue
                            placeholder={
                              ar ? "اختر من المكتبة" : "Pick library item"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {library.length === 0 ? (
                            <SelectItem value="__none" disabled>
                              {ar
                                ? "أضف عناصر للمكتبة"
                                : "Add library items first"}
                            </SelectItem>
                          ) : (
                            library.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.title}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {r.linkedResourceType === "METHODOLOGY" ? (
                      <Select
                        value={r.linkedResourceId ?? ""}
                        onValueChange={(linkedResourceId) =>
                          patch.mutate({
                            id: r.id,
                            linkedResourceType: "METHODOLOGY",
                            linkedResourceId,
                            status: "COVERED",
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-[11px]">
                          <SelectValue
                            placeholder={
                              ar ? "اختر منهجية" : "Pick methodology"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {methodologies.length === 0 ? (
                            <SelectItem value="__none" disabled>
                              {ar
                                ? "أضف منهجيات من الحساب"
                                : "Add methodologies in Account"}
                            </SelectItem>
                          ) : (
                            methodologies.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {ar ? m.titleAr ?? m.title : m.title}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {r.linkedResourceType === "PAST_PROJECT" ? (
                      <p className="text-[10px] text-muted-foreground">
                        {ar
                          ? "الأعمال السابقة تُدار من الحساب. سيتم إدراجها تلقائياً في العرض."
                          : "Past projects are managed in Account; they will appear automatically in the proposal."}
                      </p>
                    ) : null}
                    {!r.linkedResourceType ? (
                      <p className="text-[10px] text-muted-foreground">
                        {ar
                          ? "اربط شهادة أو كادر أو نص مكتبة أو منهجية كدليل."
                          : "Link a certificate, staff CV, library text, or methodology as evidence."}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </Panel>
  );
}
