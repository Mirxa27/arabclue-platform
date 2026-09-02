"use client";

/**
 * Invite people to the workspace, see who is pending, take an invitation back.
 *
 * The routes were complete — service, audit, email, seat check — and
 * reachable from nowhere; only the accept page existed, waiting for a token
 * nothing could issue. Managers (OWNER, ADMIN) see this panel; the routes
 * refuse everyone else on their own, so the check here is presentation.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Send, X, Loader2 } from "lucide-react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { apiJson } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryState, EmptyState } from "@/components/patterns";

type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  emailDeliveryState: string;
  inviter: { id: string; name: string | null; email: string } | null;
};

type WorkspaceResponse = {
  membershipRole?: string | null;
  members?: Array<{
    role: string;
    user: { id: string; name: string | null; email: string };
  }>;
};

const MANAGER_ROLES = new Set(["OWNER", "ADMIN"]);

function deliveryKey(state: string): string {
  switch (state) {
    case "SENT":
      return "invitation_delivery_sent";
    case "UNCONFIGURED":
      return "invitation_delivery_unconfigured";
    case "FAILED":
      return "invitation_delivery_failed";
    default:
      return "invitation_delivery_pending";
  }
}

export function TeamInvitationsPanel() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");

  const workspace = useQuery({
    queryKey: ["workspace"],
    queryFn: () => apiJson<WorkspaceResponse>("/api/workspaces"),
  });
  const isManager = MANAGER_ROLES.has(String(workspace.data?.membershipRole ?? ""));

  const pending = useQuery({
    queryKey: ["invitations"],
    queryFn: () => apiJson<{ invitations: PendingInvitation[] }>("/api/invitations"),
    enabled: isManager,
  });

  const invite = useMutation({
    mutationFn: () =>
      apiJson<{ emailDelivery?: string }>("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      }),
    onSuccess: (data) => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["invitations"] });
      toast({
        title: tr("INVITATION_SENT", locale),
        description: tr(deliveryKey(String(data.emailDelivery ?? "")), locale),
      });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      apiJson<{ ok: boolean }>(`/api/invitations/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      toast({ title: tr("INVITATION_REVOKED", locale) });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  // The routes refuse non-managers; showing them a form that cannot submit
  // would only be a puzzle.
  if (!workspace.isLoading && !isManager) return null;

  const members = workspace.data?.members ?? [];
  const rows = pending.data?.invitations ?? [];
  const canSubmit = email.trim().length > 3 && email.includes("@") && !invite.isPending;

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Users className="size-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{ar ? "الفريق" : "Team"}</h3>
          <p className="text-[11px] text-muted-foreground">
            {ar
              ? `${members.length} عضو · ${rows.length} دعوة معلقة`
              : `${members.length} member${members.length === 1 ? "" : "s"} · ${rows.length} pending`}
          </p>
        </div>
      </div>

      <form
        className="px-5 pt-4 pb-3 grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) invite.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="invite-email" className="text-[11px]">
            {tr("invitation_field_email", locale)}
          </Label>
          <Input
            id="invite-email"
            type="email"
            dir="ltr"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.sa"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{tr("invitation_field_role", locale)}</Label>
          <Select value={role} onValueChange={(v) => setRole(v === "ADMIN" ? "ADMIN" : "MEMBER")}>
            <SelectTrigger className="h-9 text-sm" aria-label={tr("invitation_field_role", locale)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MEMBER">{ar ? "عضو" : "Member"}</SelectItem>
              <SelectItem value="ADMIN">{ar ? "مدير" : "Admin"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={!canSubmit}>
          {invite.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          {ar ? "إرسال دعوة" : "Send invitation"}
        </Button>
      </form>

      <div className="px-5 pb-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {tr("invitation_list_title", locale)}
        </h4>
        <QueryState
          isLoading={pending.isLoading}
          isError={pending.isError}
          errorMessage={pending.error instanceof Error ? pending.error.message : undefined}
          isEmpty={rows.length === 0}
          onRetry={() => void pending.refetch()}
          loading={<div className="h-10 rounded-lg shimmer" />}
          empty={<EmptyState icon={Users} title={tr("invitation_list_empty", locale)} />}
        >
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {rows.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <span className="font-medium min-w-0 truncate" dir="ltr">
                  {inv.email}
                </span>
                <span className="text-muted-foreground">{inv.role}</span>
                <span className="text-muted-foreground">
                  {tr(deliveryKey(inv.emailDeliveryState), locale)}
                </span>
                <span className="text-muted-foreground ms-auto">
                  {tr("invitation_field_expires", locale)}{" "}
                  {new Date(inv.expiresAt).toLocaleDateString(ar ? "ar-SA" : "en-GB")}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] gap-1"
                  onClick={() => revoke.mutate(inv.id)}
                  disabled={revoke.isPending}
                  aria-label={tr("invitation_revoke_action", locale)}
                >
                  <X className="size-3" />
                  {tr("invitation_revoke_action", locale)}
                </Button>
              </li>
            ))}
          </ul>
        </QueryState>
      </div>
    </Card>
  );
}
