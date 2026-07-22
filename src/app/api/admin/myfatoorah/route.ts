import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAdmin, jsonOk, jsonError, ApiError } from "@/lib/api-controller";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { encryptValue, decryptValue, maskSecret } from "@/lib/crypto";
import {
  appBaseUrl,
  getMyFatoorahPublicConfig,
  resolveMyFatoorahBaseUrl,
  testMyFatoorahConnection,
  MYFATOORAH_ENV_URLS,
  buildWebhookV2CanonicalString,
  signWebhookV2Canonical,
} from "@/lib/myfatoorah";

export const dynamic = "force-dynamic";

const MF_KEYS = [
  "MYFATOORAH_API_KEY",
  "MYFATOORAH_WEBHOOK_SECRET",
  "MYFATOORAH_MODE",
  "MYFATOORAH_API_URL",
] as const;

async function readMaskedSecrets() {
  const rows = await db.envSetting.findMany({
    where: { key: { in: [...MF_KEYS] } },
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const mask = (key: string) => {
    const row = byKey[key];
    if (!row) return { configured: false, masked: null, lastRotatedAt: null };
    const plain = decryptValue(row.valueEncrypted);
    return {
      configured: Boolean(plain),
      masked: plain ? maskSecret(plain) : null,
      lastRotatedAt: row.lastRotatedAt,
    };
  };
  return {
    apiKey: mask("MYFATOORAH_API_KEY"),
    webhookSecret: mask("MYFATOORAH_WEBHOOK_SECRET"),
    mode: byKey.MYFATOORAH_MODE
      ? decryptValue(byKey.MYFATOORAH_MODE.valueEncrypted)
      : null,
  };
}

async function upsertSecret(
  key: string,
  value: string,
  userId: string,
  description: string
) {
  const encrypted = encryptValue(value);
  await db.envSetting.upsert({
    where: { key },
    create: {
      key,
      valueEncrypted: encrypted,
      category: "BILLING",
      description,
      isSecret: key.includes("KEY") || key.includes("SECRET"),
      isRequired: key === "MYFATOORAH_API_KEY",
      lastEditedBy: userId,
      lastRotatedAt: new Date(),
    },
    update: {
      valueEncrypted: encrypted,
      lastEditedBy: userId,
      lastRotatedAt: new Date(),
    },
  });
}

// GET /api/admin/myfatoorah — admin Payments → MyFatoorah (metadata only, no secrets)
export async function GET() {
  return withAdmin(async () => {
    const pub = await getMyFatoorahPublicConfig();
    const secrets = await readMaskedSecrets();
    const base = appBaseUrl();
    const recentWebhooks = await db.paymentWebhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        eventName: true,
        processingStatus: true,
        disposition: true,
        createdAt: true,
        processedAt: true,
        signatureValid: true,
      },
    });

    return jsonOk({
      enabled: pub.configured,
      environment: pub.environment,
      apiUrlHost: pub.apiUrlHost,
      countryIso: pub.countryIso,
      currencyIso: pub.currencyIso,
      apiKey: secrets.apiKey,
      webhookSecret: secrets.webhookSecret,
      mode: secrets.mode,
      webhookUrl: `${base}/api/billing/webhook`,
      callbackUrlPreview: `${base}/billing/callback?status=success`,
      errorUrlPreview: `${base}/billing/callback?status=error`,
      recentWebhooks,
      allowedEnvironments: {
        sandbox: MYFATOORAH_ENV_URLS.sandbox,
        production_sa: MYFATOORAH_ENV_URLS.production_sa,
      },
    });
  }, "admin myfatoorah get");
}

// POST /api/admin/myfatoorah — update config / rotate secrets / test
export async function POST(req: NextRequest) {
  return withAdmin(async (session) => {
    const body = (await req.json()) as {
      action?: string;
      apiKey?: string;
      webhookSecret?: string;
      mode?: "sandbox" | "production_sa";
      testSignaturePayload?: {
        eventName: string;
        data: Record<string, unknown>;
      };
    };

    const action = body.action ?? "save";

    if (action === "test_connection") {
      try {
        const result = await testMyFatoorahConnection();
        await audit({
          userId: session.user.id,
          action: AUDIT_ACTIONS.BILLING_CHANGE,
          resource: "MyFatoorah",
          details: {
            action: "test_connection",
            ok: result.ok,
            environment: result.environment,
            methodCount: result.paymentMethods.length,
            recurringAvailable: result.recurringAvailable,
          },
        });
        return jsonOk({
          ok: result.ok,
          environment: result.environment,
          message: result.message,
          paymentMethods: result.paymentMethods.map((m) => ({
            id: m.paymentMethodId,
            en: m.paymentMethodEn,
            ar: m.paymentMethodAr,
            code: m.paymentMethodCode,
          })),
          recurringAvailable: result.recurringAvailable,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message.slice(0, 200) : "connection_failed";
        return jsonError(message, 502);
      }
    }

    if (action === "test_webhook_signature") {
      const secretRow = await db.envSetting.findUnique({
        where: { key: "MYFATOORAH_WEBHOOK_SECRET" },
      });
      const secret = secretRow
        ? decryptValue(secretRow.valueEncrypted)
        : process.env.MYFATOORAH_WEBHOOK_SECRET ?? "";
      if (!secret) throw new ApiError("Webhook secret not configured", 400);
      const eventName =
        body.testSignaturePayload?.eventName ?? "PAYMENT_STATUS_CHANGED";
      const data = body.testSignaturePayload?.data ?? {
        Invoice: { Id: "1", Status: "PAID", ExternalIdentifier: "test" },
        Transaction: { Status: "SUCCESS", PaymentId: "pay1" },
      };
      const canonical = buildWebhookV2CanonicalString(eventName, data);
      const signature = signWebhookV2Canonical(canonical, secret);
      return jsonOk({ ok: true, canonical, signatureSampleLength: signature.length });
    }

    if (action === "save" || action === "rotate") {
      if (body.mode) {
        const url = resolveMyFatoorahBaseUrl(body.mode);
        await upsertSecret(
          "MYFATOORAH_MODE",
          body.mode,
          session.user.id,
          "MyFatoorah environment alias (sandbox | production_sa)"
        );
        await upsertSecret(
          "MYFATOORAH_API_URL",
          url,
          session.user.id,
          "Official MyFatoorah API base URL (allowlisted)"
        );
      }
      if (body.apiKey?.trim()) {
        await upsertSecret(
          "MYFATOORAH_API_KEY",
          body.apiKey.trim(),
          session.user.id,
          "MyFatoorah API bearer token"
        );
      }
      if (body.webhookSecret?.trim()) {
        await upsertSecret(
          "MYFATOORAH_WEBHOOK_SECRET",
          body.webhookSecret.trim(),
          session.user.id,
          "MyFatoorah Webhook V2 HMAC secret"
        );
      }

      await audit({
        userId: session.user.id,
        action: AUDIT_ACTIONS.ENV_UPDATE,
        resource: "MyFatoorah",
        details: {
          action,
          mode: body.mode ?? null,
          apiKeyRotated: Boolean(body.apiKey?.trim()),
          webhookSecretRotated: Boolean(body.webhookSecret?.trim()),
        },
        severity: "WARN",
      });

      return jsonOk({ ok: true });
    }

    throw new ApiError("Unknown action", 400);
  }, "admin myfatoorah post");
}
