"use client";

import { useLocale, useUI } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/patterns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardList, Loader2 } from "lucide-react";

export function RequirementsMatrix() {
  const { locale } = useLocale();
  const { activeProjectId, setView } = useUI();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["requirements", activeProjectId],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${activeProjectId}/requirements`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const patch = useMutation({
    mutationFn: async (body: { id: string; status: string }) => {
      const res = await fetch(`/api/projects/${activeProjectId}/requirements`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requirements", activeProjectId] }),
  });

  if (!activeProjectId) {
    return (
      <Panel
        icon={ClipboardList}
        title={locale === "ar" ? "مصفوفة المتطلبات" : "Requirements matrix"}
      >
        <p className="p-4 text-sm text-muted-foreground">
          {locale === "ar"
            ? "اختر مشروعاً نشطاً لعرض المتطلبات المستخرجة."
            : "Select an active project to view extracted requirements."}
        </p>
      </Panel>
    );
  }

  if (isLoading) {
    return (
      <Panel icon={ClipboardList} title="Requirements">
        <div className="p-8 flex justify-center">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </Panel>
    );
  }

  const items = data?.items ?? [];
  const summary = data?.summary ?? { total: 0, COVERED: 0, IN_PROGRESS: 0, MISSING: 0 };

  return (
    <Panel
      icon={ClipboardList}
      title={locale === "ar" ? "مصفوفة المتطلبات" : "Requirements matrix"}
      subtitle={`${summary.COVERED} covered · ${summary.IN_PROGRESS} in progress · ${summary.MISSING} missing`}
      actions={
        <Button size="sm" variant="outline" onClick={() => setView("documents")}>
          {locale === "ar" ? "المستندات" : "Documents"}
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start text-muted-foreground">
              <th className="p-3 font-medium">#</th>
              <th className="p-3 font-medium">{locale === "ar" ? "المتطلب" : "Requirement"}</th>
              <th className="p-3 font-medium">{locale === "ar" ? "المرجع" : "Ref"}</th>
              <th className="p-3 font-medium">{locale === "ar" ? "الحالة" : "Status"}</th>
              <th className="p-3 font-medium">{locale === "ar" ? "الربط" : "Link"}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {locale === "ar"
                    ? "شغّل الوكلاء لاستخراج المتطلبات من كراسة الشروط."
                    : "Run agents to extract requirements from the tender package."}
                </td>
              </tr>
            ) : (
              items.map(
                (
                  r: {
                    id: string;
                    text: string;
                    sectionRef?: string;
                    pageRef?: string;
                    status: string;
                    linkedResourceType?: string;
                  },
                  i: number
                ) => (
                  <tr key={r.id} className="border-b border-border/40 align-top">
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3 max-w-md">{r.text}</td>
                    <td className="p-3 whitespace-nowrap text-xs">
                      {r.sectionRef && <div>§{r.sectionRef}</div>}
                      {r.pageRef && <div>p.{r.pageRef}</div>}
                    </td>
                    <td className="p-3">
                      <Select
                        value={r.status}
                        onValueChange={(status) => patch.mutate({ id: r.id, status })}
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
                    <td className="p-3">
                      {r.linkedResourceType ? (
                        <Badge variant="outline">{r.linkedResourceType}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
