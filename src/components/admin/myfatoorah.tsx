"use client";

import { useState } from "react";
import { useLocale } from "@/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  RefreshCw,
  Save,
  Shield,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MfConfig = {
  enabled: boolean;
  environment: string | null;
  apiUrlHost: string | null;
  countryIso: string;
  currencyIso: string;
  apiKey: { configured: boolean; masked: string | null; lastRotatedAt: string | null };
  webhookSecret: { configured: boolean; masked: string | null; lastRotatedAt: string | null };
  mode: string | null;
  webhookUrl: string;
  callbackUrlPreview: string;
  errorUrlPreview: string;
  recentWebhooks: Array<{
    id: string;
    eventName: string | null;
    processingStatus: string;
    disposition: string | null;
    createdAt: string;
    signatureValid: boolean;
  }>;
};

export function AdminMyFatoorah() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [mode, setMode] = useState<"sandbox" | "production_sa">("sandbox");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-myfatoorah"],
    queryFn: async () => {
      const res = await fetch("/api/admin/myfatoorah");
      if (!res.ok) throw new Error("Failed to load MyFatoorah config");
      return (await res.json()) as MfConfig;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/myfatoorah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          mode,
          apiKey: apiKey || undefined,
          webhookSecret: webhookSecret || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      return json;
    },
    onSuccess: () => {
      setApiKey("");
      setWebhookSecret("");
      qc.invalidateQueries({ queryKey: ["admin-myfatoorah"] });
      toast({
        title: locale === "ar" ? "تم الحفظ" : "Saved",
        description:
          locale === "ar"
            ? "أسرار مي فاتورة مشفرة وكتابة فقط"
            : "MyFatoorah secrets stored encrypted (write-only)",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testConn = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/myfatoorah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_connection" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "test failed");
      return json;
    },
    onSuccess: (json) => {
      toast({
        title: json.ok ? "OK" : "Partial",
        description: json.message,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testSig = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/myfatoorah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_webhook_signature" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "signature test failed");
      return json;
    },
    onSuccess: () =>
      toast({
        title: locale === "ar" ? "توقيع صالح" : "Signature OK",
        description:
          locale === "ar"
            ? "تم توليد السلسلة القانونية Webhook V2"
            : "Webhook V2 canonical string generated",
      }),
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: locale === "ar" ? "تم النسخ" : "Copied" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {locale === "ar" ? "المدفوعات → مي فاتورة" : "Payments → MyFatoorah"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? "إعدادات سعودية (SAU / SAR) — الأسرار مشفرة ولا تُعرض بعد الحفظ"
              : "Saudi Arabia (SAU / SAR) — secrets encrypted and never displayed after save"}
          </p>
        </div>
        <Badge variant={data?.enabled ? "default" : "secondary"}>
          {data?.enabled ? "Enabled" : "Not configured"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" /> Configuration
          </div>
          <div className="grid gap-2 text-sm">
            <div>
              Country: <strong>{data?.countryIso}</strong>
            </div>
            <div>
              Currency: <strong>{data?.currencyIso}</strong>
            </div>
            <div>
              Environment:{" "}
              <strong>{data?.environment ?? data?.mode ?? "—"}</strong>
            </div>
            <div>
              API host: <strong>{data?.apiUrlHost ?? "—"}</strong>
            </div>
            <div>
              API token:{" "}
              <strong>
                {data?.apiKey.configured
                  ? data.apiKey.masked
                  : "not set"}
              </strong>
            </div>
            <div>
              Webhook secret:{" "}
              <strong>
                {data?.webhookSecret.configured
                  ? data.webhookSecret.masked
                  : "not set"}
              </strong>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium">Endpoints</div>
          <div className="space-y-2 text-xs break-all">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground shrink-0">Webhook</span>
              <code className="flex-1">{data?.webhookUrl}</code>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => data && copy(data.webhookUrl)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div>
              <span className="text-muted-foreground">Callback </span>
              <code>{data?.callbackUrlPreview}</code>
            </div>
            <div>
              <span className="text-muted-foreground">Error </span>
              <code>{data?.errorUrlPreview}</code>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-4">
        <div className="text-sm font-medium">
          {locale === "ar" ? "تدوير الأسرار / الوضع" : "Rotate secrets / mode"}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as "sandbox" | "production_sa")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (apitest)</SelectItem>
                <SelectItem value="production_sa">
                  Production SA (api-sa)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>API token (write-only)</Label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={
                data?.apiKey.configured ? "•••• replace token" : "Paste API token"
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Webhook secret (write-only)</Label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={
                data?.webhookSecret.configured
                  ? "•••• replace secret"
                  : "Paste webhook secret"
              }
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
          <Button
            variant="outline"
            onClick={() => testConn.mutate()}
            disabled={testConn.isPending}
          >
            {testConn.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Connection test
          </Button>
          <Button
            variant="outline"
            onClick={() => testSig.mutate()}
            disabled={testSig.isPending}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Webhook signature test
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Recent webhooks</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Disposition</TableHead>
              <TableHead>Sig</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.recentWebhooks ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No webhook events received yet
                </TableCell>
              </TableRow>
            )}
            {(data?.recentWebhooks ?? []).map((w) => (
              <TableRow key={w.id}>
                <TableCell>{w.eventName ?? "—"}</TableCell>
                <TableCell>{w.processingStatus}</TableCell>
                <TableCell>{w.disposition ?? "—"}</TableCell>
                <TableCell>{w.signatureValid ? "valid" : "invalid"}</TableCell>
                <TableCell>
                  {new Date(w.createdAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
