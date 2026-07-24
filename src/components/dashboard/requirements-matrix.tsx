"use client";

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

export function RequirementsMatrix() {
  const { locale } = useLocale();
  const { activeProjectId, setView } = useUI();
  const qc = useQueryClient();
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

  const { data: certsData } = useQuery({
    queryKey: ["certificates"],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch("/api/certificates");
      if (!res.ok) return { items: [] };
      return res.json();
    },
  });

  const { data: staffData } = useQuery({
    queryKey: ["staff"],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch("/api/staff");
      if (!res.ok) return { items: [] };
      return res.json();
    },
  });

  const { data: libraryData } = useQuery({
    queryKey: ["library"],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch("/api/library");
      if (!res.ok) return { items: [] };
      return res.json();
    },
  });

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
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["requirements", activeProjectId] }),
  });

  if (!activeProjectId) {
    return (
      <Panel
        icon={ClipboardList}
        title={ar ? "مصفوفة المتطلبات" : "Requirements matrix"}
      >
        <p className="p-4 text-sm text-muted-foreground">
          {ar
            ? "اختر مشروعاً نشطاً لعرض المتطلبات المستخرجة."
            : "Select an active project to view extracted requirements."}
        </p>
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

  return (
    <Panel
      icon={ClipboardList}
      title={ar ? "مصفوفة المتطلبات" : "Requirements matrix"}
      subtitle={`${summary.COVERED} covered · ${summary.IN_PROGRESS} in progress · ${summary.MISSING} missing`}
      actions={
        <Button size="sm" variant="outline" onClick={() => setView("documents")}>
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
              <Button size="sm" onClick={() => setView("agents")}>
                {ar ? "الوكلاء" : "Agents"}
              </Button>
            }
          />
        }
      >
        <div className="overflow-x-auto">
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
                        <SelectItem value="COVERED">COVERED</SelectItem>
                        <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
                        <SelectItem value="MISSING">MISSING</SelectItem>
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
                            Certificate
                          </SelectItem>
                          <SelectItem value="STAFF">Staff / CV</SelectItem>
                          <SelectItem value="LIBRARY">Library</SelectItem>
                          <SelectItem value="METHODOLOGY">
                            Methodology
                          </SelectItem>
                          <SelectItem value="PAST_PROJECT">
                            Past project
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
                    {!r.linkedResourceType ? (
                      <p className="text-[10px] text-muted-foreground">
                        {ar
                          ? "اربط شهادة أو كادر أو نص مكتبة كدليل."
                          : "Link a certificate, staff CV, or library text as evidence."}
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
