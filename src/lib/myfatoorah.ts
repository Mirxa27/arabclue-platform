/**
 * MyFatoorah payment gateway client (Saudi Arabia / GCC).
 * Docs: https://docs.myfatoorah.com/docs/send-payment
 *         https://docs.myfatoorah.com/docs/payment-inquiry
 *
 * Credentials from process.env or encrypted EnvSetting (admin UI).
 */

import crypto from "crypto";
import { getDecryptedEnv } from "./env-settings";

export type MyFatoorahConfig = {
  apiKey: string;
  apiUrl: string;
  webhookSecret: string;
};

export type SendPaymentInput = {
  customerName: string;
  customerEmail: string;
  invoiceValue: number;
  currencyIso?: string;
  customerReference: string;
  callBackUrl: string;
  errorUrl: string;
  language?: "AR" | "EN";
  userDefinedField?: string;
  invoiceItems?: { ItemName: string; Quantity: number; UnitPrice: number }[];
  webhookUrl?: string;
};

export type SendPaymentResult = {
  invoiceId: string;
  invoiceUrl: string;
  customerReference: string;
};

export type PaymentStatusResult = {
  invoiceId: string;
  invoiceStatus: string;
  invoiceValue: number;
  customerReference: string | null;
  paymentId: string | null;
  paymentMethod: string | null;
  paidCurrency: string | null;
  isPaid: boolean;
  isFailed: boolean;
  isPending: boolean;
  raw: unknown;
};

async function loadConfig(): Promise<MyFatoorahConfig> {
  const apiKey = (await getDecryptedEnv("MYFATOORAH_API_KEY")).trim();
  const apiUrl = (
    (await getDecryptedEnv("MYFATOORAH_API_URL")) ||
    "https://apitest.myfatoorah.com"
  ).replace(/\/$/, "");
  const webhookSecret = (
    await getDecryptedEnv("MYFATOORAH_WEBHOOK_SECRET")
  ).trim();
  if (!apiKey) {
    throw new Error(
      "MYFATOORAH_API_KEY is not configured — set it in Admin → Environment or .env"
    );
  }
  return { apiKey, apiUrl, webhookSecret };
}

async function mfPost<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const cfg = await loadConfig();
  const res = await fetch(`${cfg.apiUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    IsSuccess?: boolean;
    Message?: string;
    ValidationErrors?: { Name?: string; Error?: string }[] | null;
    Data?: T;
  };
  if (!res.ok || !json.IsSuccess || !json.Data) {
    const validation = (json.ValidationErrors ?? [])
      .map((v) => `${v.Name}: ${v.Error}`)
      .join("; ");
    throw new Error(
      json.Message ||
        validation ||
        `MyFatoorah ${path} failed (HTTP ${res.status})`
    );
  }
  return json.Data;
}

/** Create invoice link (NotificationOption=LNK) and return Payment URL. */
export async function sendPayment(
  input: SendPaymentInput
): Promise<SendPaymentResult> {
  const data = await mfPost<{
    InvoiceId: number | string;
    InvoiceURL: string;
    CustomerReference?: string;
  }>("/v2/SendPayment", {
    CustomerName: input.customerName,
    NotificationOption: "LNK",
    CustomerEmail: input.customerEmail,
    InvoiceValue: Number(input.invoiceValue.toFixed(3)),
    DisplayCurrencyIso: (input.currencyIso ?? "SAR").toUpperCase(),
    CallBackUrl: input.callBackUrl,
    ErrorUrl: input.errorUrl,
    Language: input.language ?? "AR",
    CustomerReference: input.customerReference,
    UserDefinedField: input.userDefinedField ?? undefined,
    InvoiceItems: input.invoiceItems,
    WebhookUrl: input.webhookUrl,
  });

  return {
    invoiceId: String(data.InvoiceId),
    invoiceUrl: data.InvoiceURL,
    customerReference: data.CustomerReference ?? input.customerReference,
  };
}

/** Inquire payment status by PaymentId (callback) or InvoiceId. */
export async function getPaymentStatus(opts: {
  key: string;
  keyType: "PaymentId" | "InvoiceId" | "CustomerReference";
}): Promise<PaymentStatusResult> {
  const data = await mfPost<{
    InvoiceId?: number | string;
    InvoiceStatus?: string;
    InvoiceValue?: number;
    CustomerReference?: string;
    InvoiceTransactions?: Array<{
      PaymentId?: string | number;
      PaymentGateway?: string;
      TransactionStatus?: string;
      PaidCurrency?: string;
    }>;
  }>("/v2/GetPaymentStatus", {
    Key: opts.key,
    KeyType: opts.keyType,
  });

  const status = (data.InvoiceStatus ?? "").trim();
  const tx = data.InvoiceTransactions?.[0];
  const isPaid = /^paid$/i.test(status);
  const isFailed = /^(failed|canceled|cancelled|expired)$/i.test(status);
  const isPending = !isPaid && !isFailed;

  return {
    invoiceId: String(data.InvoiceId ?? ""),
    invoiceStatus: status,
    invoiceValue: Number(data.InvoiceValue ?? 0),
    customerReference: data.CustomerReference ?? null,
    paymentId: tx?.PaymentId != null ? String(tx.PaymentId) : null,
    paymentMethod: tx?.PaymentGateway ?? null,
    paidCurrency: tx?.PaidCurrency ?? null,
    isPaid,
    isFailed,
    isPending,
    raw: data,
  };
}

/**
 * Verify MyFatoorah webhook signature (HMAC-SHA256 of body, base64).
 * Returns true when secret is unset (dev only) or signature matches.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  const webhookSecret = (
    await getDecryptedEnv("MYFATOORAH_WEBHOOK_SECRET")
  ).trim();
  if (!webhookSecret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader) return false;
  const digest = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function appBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}
