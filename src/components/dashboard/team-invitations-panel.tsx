"use client";

/**
 * Invite people to the workspace, see who is pending, take an invitation back,
 * and manage who is already in: change a member's role or remove them.
 *
 * The routes were complete — service, audit, email, seat check — and
 * reachable from nowhere; only the accept page existed, waiting for a token
 * nothing could issue. Managers (OWNER, ADMIN) see this panel; the routes
 * refuse everyone else on their own, so the check here is presentation.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Send, X, Loader2, RotateCw, UserMinus } from "lucide-react";
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

type WorkspaceMember = {
  id: string;
  role: string;
  user: { id: string; name: string | null; email: string };
};

type WorkspaceResponse = {
  membershipRole?: string | null;
  members?: WorkspaceMember[];
};

const MANAGER_ROLES = new Set(["OWNER", "ADMIN"]);
const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];

/** A delivery state the manager can act on by sending the invitation again. */
const RESENDABLE_STATES = new Set(["UNCONFIGURED", "FAILED"]);

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

function memberRoleKey(role: string): string {
  switch (role) {
    case "OWNER":
      return "team_member_role_owner";
    case "ADMIN":
      return "team_member_role_admin";
    default:
      return "team_member_role_member";
  }
}

function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

export function TeamInvitationsPanel() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");

  const workspace = useQuery({
    queryKey: ["workspace"],
    queryFn: () => apiJson<WorkspaceResponse>("/api/workspaces"),
  });
  const membershipRole = String(workspace.data?.membershipRole ?? "");
  const isManager = MANAGER_ROLES.has(membershipRole);
  // Only an OWNER may hand out or take away OWNER; the route enforces it, the
  // select just does not offer what will be refused.
  const canAssignOwner = membershipRole === "OWNER";

  const pending = useQuery({
    queryKey: ["invitations"],
    queryFn: () => apiJson<{ invitations: PendingInvitation[] }>("/api/invitations"),
    enabled: isManager,
  });

  const postInvitation = (inviteEmail: string, inviteRole: string) =>
    apiJson<{ emailDelivery?: string }>("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });

  const invite = useMutation({
    mutationFn: () => postInvitation(email.trim(), role),
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

  // Re-POSTing replaces the pending invitation for that address with a fresh
  // token and a fresh delivery attempt — the same seat, a new message.
  const resend = useMutation({
    mutationFn: (inv: PendingInvitation) => postInvitation(inv.email, inv.role),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      toast({
        title: tr("invitation_resent", locale),
        description: tr(deliveryKey(String(data.emailDelivery ?? "")), locale),
      });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const changeRole = useMutation({
    mutationFn: (input: { memberId: string; role: MemberRole }) =>
      apiJson<{ member: WorkspaceMember }>(
        `/api/workspaces/members/${encodeURIComponent(input.memberId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: input.role }),
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace"] });
      toast({ title: tr("team_member_role_updated", locale) });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      apiJson<{ ok: boolean }>(
        `/api/workspaces/members/${encodeURIComponent(memberId)}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace"] });
      toast({ title: tr("team_member_removed", locale) });
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
  const selfUserId = session?.user?.id ?? null;
  const memberBusy = changeRole.isPending || removeMember.isPending;

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Users className="size-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{tr("team_panel_title", locale)}</h3>
          <p className="text-[11px] text-muted-foreground">
            {tr("team_panel_summary", locale, {
              members: String(members.length),
              pending: String(rows.length),
            })}
          </p>
        </div>
      </div>

      <div className="px-5 pt-4 pb-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {tr("team_members_title", locale)}
        </h4>
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
          {members.map((member) => {
            const isSelf = member.user.id === selfUserId;
            // The route refuses editing yourself, touching an OWNER as a
            // non-owner, and demoting the last owner; the controls mirror the
            // first two so the refusal is never the first thing seen.
            const locked =
              isSelf || (member.role === "OWNER" && !canAssignOwner) || memberBusy;
            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block font-medium truncate">
                    {member.user.name || member.user.email}
                    {isSelf ? (
                      <span className="ms-1.5 text-muted-foreground font-normal">
                        ({tr("team_member_you", locale)})
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-muted-foreground truncate" dir="ltr">
                    {member.user.email}
                  </span>
                </span>
                <Select
                  value={member.role}
                  disabled={locked}
                  onValueChange={(value) => {
                    if (isMemberRole(value) && value !== member.role) {
                      changeRole.mutate({ memberId: member.id, role: value });
                    }
                  }}
                >
                  <SelectTrigger
                    className="h-7 w-28 text-[11px]"
                    aria-label={tr("invitation_field_role", locale)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_ROLES.filter(
                      (value) => value !== "OWNER" || canAssignOwner || member.role === "OWNER"
                    ).map((value) => (
                      <SelectItem key={value} value={value}>
                        {tr(memberRoleKey(value), locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px] gap-1"
                  disabled={locked}
                  aria-label={tr("team_member_remove_action", locale)}
                  onClick={() => {
                    if (
                      window.confirm(
                        tr("team_member_remove_confirm", locale, {
                          email: member.user.email,
                        })
                      )
                    ) {
                      removeMember.mutate(member.id);
                    }
                  }}
                >
                  <UserMinus className="size-3" />
                  {tr("team_member_remove_action", locale)}
                </Button>
              </li>
            );
          })}
        </ul>
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
              <SelectItem value="MEMBER">{tr("team_member_role_member", locale)}</SelectItem>
              <SelectItem value="ADMIN">{tr("team_member_role_admin", locale)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={!canSubmit}>
          {invite.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          {tr("team_invite_send_action", locale)}
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
                {RESENDABLE_STATES.has(inv.emailDeliveryState) ? (
                  // The message never reached them; the state label alone left
                  // the manager with nothing to do about it.
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px] gap-1"
                    onClick={() => resend.mutate(inv)}
                    disabled={resend.isPending}
                    aria-label={tr("invitation_resend_action", locale)}
                  >
                    <RotateCw className="size-3" />
                    {tr("invitation_resend_action", locale)}
                  </Button>
                ) : null}
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
