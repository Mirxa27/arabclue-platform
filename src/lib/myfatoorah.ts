/**
 * MyFatoorah payment gateway adapter (Saudi Arabia / GCC).
 *
 * Security:
 * - API base URL allowlisted (no browser-supplied arbitrary hosts — SSRF guard).
 * - Bearer token from secure config only.
 * - Webhook V2 signature uses HMAC-SHA256 over event-specific canonical fields
 *   (not the raw body). See https://docs.myfatoorah.com/docs/webhook-signature
 *
 * Money: ArabClue stores minor units (halalas) internally at the billing layer;
 * this adapter converts to decimal SAR at the gateway boundary only.
 */

import crypto from "crypto";
import { getDecryptedEnv } from "./env-settings";

/** Official MyFatoorah environment endpoints — never accept arbitrary URLs. */
export const MYFATOORAH_ALLOWED_BASE_URLS = [
  "https://apitest.myfatoorah.com",
  "https://api-sa.myfatoorah.com",
  "https://api.myfatoorah.com",
  "https://api-ae.myfatoorah.com",
  "https://api-qa.myfatoorah.com",
  "https://api-eg.myfatoorah.com",
] as const;

export type MyFatoorahEnvironment = "sandbox" | "production_sa";

export const MYFATOORAH_ENV_URLS: Record<MyFatoorahEnvironment, string> = {
  sandbox: "https://apitest.myfatoorah.com",
  production_sa: "https://api-sa.myfatoorah.com",
};

export type MyFatoorahConfig = {
  apiKey: string;
  apiUrl: string;
  webhookSecret: string;
  environment: MyFatoorahEnvironment;
  countryIso: "SAU";
  currencyIso: "SAR";
};

export type SendPaymentInput = {
  customerName: string;
  customerEmail: string;
  /** Decimal SAR — convert from minor units at call site */
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

export type PaymentMethodInfo = {
  paymentMethodId: number;
  paymentMethodEn: string;
  paymentMethodAr: string;
  paymentMethodCode: string;
  isDirectPayment: boolean;
  currencyIso: string;
};

export type RecurringModel = {
  recurringType: "Custom" | "Daily" | "Weekly" | "Monthly";
  intervalDays?: number;
  iteration?: number;
  retryCount?: number;
};

export type RecurringPaymentResult = {
  invoiceId: string;
  paymentUrl: string;
  customerReference: string;
  recurringId: string;
};

/** Minor units (halalas) ↔ decimal SAR at adapter boundary only. */
export function sarToMinorUnits(amountSar: number): number {
  return Math.round(amountSar * 100);
}

export function minorUnitsToSar(minor: number): number {
  return Math.round(minor) / 100;
}

export function resolveMyFatoorahBaseUrl(
  envOrUrl: string | null | undefined
): string {
  const raw = (envOrUrl ?? "").trim().replace(/\/$/, "");
  if (!raw) return MYFATOORAH_ENV_URLS.sandbox;

  // Accept environment aliases
  if (raw === "sandbox" || raw === "test") return MYFATOORAH_ENV_URLS.sandbox;
  if (raw === "production" || raw === "production_sa" || raw === "sa") {
    return MYFATOORAH_ENV_URLS.production_sa;
  }

  const allowed = MYFATOORAH_ALLOWED_BASE_URLS.find(
    (u) => u === raw || `${u}/` === `${raw}/`
  );
  if (!allowed) {
    throw new Error(
      "MYFATOORAH_API_URL is not an official MyFatoorah endpoint. Allowed: " +
        MYFATOORAH_ALLOWED_BASE_URLS.join(", ")
    );
  }
  return allowed;
}

export function environmentFromUrl(apiUrl: string): MyFatoorahEnvironment {
  return apiUrl.includes("apitest.myfatoorah.com")
    ? "sandbox"
    : "production_sa";
}

async function loadConfig(): Promise<MyFatoorahConfig> {
  const apiKey = (await getDecryptedEnv("MYFATOORAH_API_KEY")).trim();
  const mode = (await getDecryptedEnv("MYFATOORAH_MODE")).trim();
  const rawUrl = (await getDecryptedEnv("MYFATOORAH_API_URL")).trim();
  const apiUrl = resolveMyFatoorahBaseUrl(mode || rawUrl);
  const webhookSecret = (
    await getDecryptedEnv("MYFATOORAH_WEBHOOK_SECRET")
  ).trim();

  if (!apiKey) {
    throw new Error(
      "MYFATOORAH_API_KEY is not configured — set it in Admin → Payments → MyFatoorah or .env"
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    apiUrl.includes("apitest.myfatoorah.com")
  ) {
    throw new Error(
      "MYFATOORAH is set to sandbox in production — switch to https://api-sa.myfatoorah.com"
    );
  }

  return {
    apiKey,
    apiUrl,
    webhookSecret,
    environment: environmentFromUrl(apiUrl),
    countryIso: "SAU",
    currencyIso: "SAR",
  };
}

export async function getMyFatoorahPublicConfig(): Promise<{
  configured: boolean;
  environment: MyFatoorahEnvironment | null;
  apiUrlHost: string | null;
  countryIso: "SAU";
  currencyIso: "SAR";
  webhookConfigured: boolean;
  apiKeyConfigured: boolean;
}> {
  try {
    const apiKey = (await getDecryptedEnv("MYFATOORAH_API_KEY")).trim();
    const mode = (await getDecryptedEnv("MYFATOORAH_MODE")).trim();
    const rawUrl = (await getDecryptedEnv("MYFATOORAH_API_URL")).trim();
    const webhookSecret = (
      await getDecryptedEnv("MYFATOORAH_WEBHOOK_SECRET")
    ).trim();
    if (!apiKey && !rawUrl && !mode) {
      return {
        configured: false,
        environment: null,
        apiUrlHost: null,
        countryIso: "SAU",
        currencyIso: "SAR",
        webhookConfigured: Boolean(webhookSecret),
        apiKeyConfigured: false,
      };
    }
    const apiUrl = resolveMyFatoorahBaseUrl(mode || rawUrl);
    return {
      configured: Boolean(apiKey),
      environment: environmentFromUrl(apiUrl),
      apiUrlHost: new URL(apiUrl).host,
      countryIso: "SAU",
      currencyIso: "SAR",
      webhookConfigured: Boolean(webhookSecret),
      apiKeyConfigured: Boolean(apiKey),
    };
  } catch {
    return {
      configured: false,
      environment: null,
      apiUrlHost: null,
      countryIso: "SAU",
      currencyIso: "SAR",
      webhookConfigured: false,
      apiKeyConfigured: false,
    };
  }
}

async function mfRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const cfg = await loadConfig();
  const res = await fetch(`${cfg.apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as {
    IsSuccess?: boolean;
    Message?: string;
    ValidationErrors?: { Name?: string; Error?: string }[] | null;
    Data?: T;
  };
  if (!res.ok || !json.IsSuccess || json.Data === undefined || json.Data === null) {
    const validation = (json.ValidationErrors ?? [])
      .map((v) => `${v.Name}: ${v.Error}`)
      .join("; ");
    // Sanitize — never leak tokens
    throw new Error(
      json.Message ||
        validation ||
        `MyFatoorah ${path} failed (HTTP ${res.status})`
    );
  }
  return json.Data;
}

/** Create invoice link (NotificationOption=LNK). */
export async function sendPayment(
  input: SendPaymentInput
): Promise<SendPaymentResult> {
  const currency = (input.currencyIso ?? "SAR").toUpperCase();
  if (currency !== "SAR") {
    throw new Error("ArabClue production billing supports SAR only");
  }

  const data = await mfRequest<{
    InvoiceId: number | string;
    InvoiceURL: string;
    CustomerReference?: string;
  }>("POST", "/v2/SendPayment", {
    CustomerName: input.customerName,
    NotificationOption: "LNK",
    CustomerEmail: input.customerEmail,
    InvoiceValue: Number(input.invoiceValue.toFixed(3)),
    DisplayCurrencyIso: currency,
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

/** Discover enabled payment methods for amount/currency. */
export async function initiatePayment(opts: {
  invoiceAmount: number;
  currencyIso?: string;
}): Promise<PaymentMethodInfo[]> {
  const data = await mfRequest<{
    PaymentMethods?: Array<{
      PaymentMethodId: number;
      PaymentMethodEn?: string;
      PaymentMethodAr?: string;
      PaymentMethodCode?: string;
      IsDirectPayment?: boolean;
      CurrencyIso?: string;
    }>;
  }>("POST", "/v2/InitiatePayment", {
    InvoiceAmount: opts.invoiceAmount,
    CurrencyIso: (opts.currencyIso ?? "SAR").toUpperCase(),
  });

  return (data.PaymentMethods ?? []).map((m) => ({
    paymentMethodId: m.PaymentMethodId,
    paymentMethodEn: m.PaymentMethodEn ?? "",
    paymentMethodAr: m.PaymentMethodAr ?? "",
    paymentMethodCode: m.PaymentMethodCode ?? "",
    isDirectPayment: Boolean(m.IsDirectPayment),
    currencyIso: m.CurrencyIso ?? "SAR",
  }));
}

/** Inquire payment status by PaymentId (callback) or InvoiceId. */
export async function getPaymentStatus(opts: {
  key: string;
  keyType: "PaymentId" | "InvoiceId" | "CustomerReference";
}): Promise<PaymentStatusResult> {
  const data = await mfRequest<{
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
  }>("POST", "/v2/GetPaymentStatus", {
    Key: opts.key,
    KeyType: opts.keyType,
  });

  const status = (data.InvoiceStatus ?? "").trim();
  const tx = data.InvoiceTransactions?.[0];
  const txOk = (data.InvoiceTransactions ?? []).some((t) =>
    /^(succss|success)$/i.test(t.TransactionStatus ?? "")
  );
  const isPaid = /^paid$/i.test(status) || txOk;
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
 * Create MyFatoorah-managed recurring payment (when merchant account supports it).
 * Uses ExecutePayment + RecurringModel — not SendPayment.
 */
export async function createRecurringPayment(opts: {
  paymentMethodId: number;
  invoiceValue: number;
  customerName: string;
  customerEmail: string;
  customerMobile?: string;
  customerReference: string;
  callBackUrl: string;
  errorUrl: string;
  language?: "AR" | "EN";
  recurring: RecurringModel;
}): Promise<RecurringPaymentResult> {
  const retry = Math.min(5, Math.max(0, opts.recurring.retryCount ?? 3));
  const data = await mfRequest<{
    InvoiceId: number | string;
    PaymentURL: string;
    CustomerReference?: string;
    RecurringId?: string;
  }>("POST", "/v2/ExecutePayment", {
    PaymentMethodId: opts.paymentMethodId,
    InvoiceValue: Number(opts.invoiceValue.toFixed(3)),
    CustomerName: opts.customerName,
    CustomerEmail: opts.customerEmail,
    MobileCountryCode: "966",
    CustomerMobile: opts.customerMobile ?? "500000000",
    CallBackUrl: opts.callBackUrl,
    ErrorUrl: opts.errorUrl,
    DisplayCurrencyIso: "SAR",
    CustomerReference: opts.customerReference,
    Language: opts.language ?? "AR",
    RecurringModel: {
      RecurringType: opts.recurring.recurringType,
      IntervalDays:
        opts.recurring.recurringType === "Custom"
          ? opts.recurring.intervalDays ?? 30
          : 0,
      Iteration: opts.recurring.iteration ?? 0,
      RetryCount: retry,
    },
  });

  if (!data.RecurringId) {
    throw new Error(
      "MyFatoorah recurring is not available for this merchant account or payment method"
    );
  }

  return {
    invoiceId: String(data.InvoiceId),
    paymentUrl: data.PaymentURL,
    customerReference: data.CustomerReference ?? opts.customerReference,
    recurringId: data.RecurringId,
  };
}

export async function listRecurringPayments(): Promise<
  Array<{
    recurringId: string;
    recurringStatus: string;
    isActive: boolean;
    recurringValue: number;
  }>
> {
  const data = await mfRequest<{
    RecurringPayment?: Array<{
      RecurringId?: string;
      RecurringStatus?: string;
      IsActive?: boolean;
      RecurringValue?: number;
    }>;
  }>("GET", "/v2/GetRecurringPayment");

  return (data.RecurringPayment ?? []).map((r) => ({
    recurringId: r.RecurringId ?? "",
    recurringStatus: (r.RecurringStatus ?? "").toUpperCase(),
    isActive: Boolean(r.IsActive),
    recurringValue: Number(r.RecurringValue ?? 0),
  }));
}

export async function cancelRecurringPayment(
  recurringId: string
): Promise<boolean> {
  const data = await mfRequest<boolean>(
    "POST",
    `/v2/CancelRecurringPayment?recurringId=${encodeURIComponent(recurringId)}`
  );
  return Boolean(data);
}

export async function resumeRecurringPayment(
  recurringId: string
): Promise<boolean> {
  const data = await mfRequest<boolean>(
    "POST",
    `/v2/ResumeRecurringPayment?recurringId=${encodeURIComponent(recurringId)}`
  );
  return Boolean(data);
}

/** Connectivity + feature probe for admin panel (sanitized). */
export async function testMyFatoorahConnection(): Promise<{
  ok: boolean;
  environment: MyFatoorahEnvironment;
  paymentMethods: PaymentMethodInfo[];
  recurringAvailable: boolean | null;
  message: string;
}> {
  const cfg = await loadConfig();
  const methods = await initiatePayment({ invoiceAmount: 1, currencyIso: "SAR" });
  let recurringAvailable: boolean | null = null;
  try {
    await listRecurringPayments();
    recurringAvailable = true;
  } catch {
    recurringAvailable = false;
  }
  return {
    ok: methods.length > 0,
    environment: cfg.environment,
    paymentMethods: methods,
    recurringAvailable,
    message:
      methods.length > 0
        ? `Connected to ${cfg.apiUrl}; ${methods.length} payment method(s)`
        : "Connected but no payment methods returned",
  };
}

// ─── Webhook V2 signature (canonical fields, not raw body) ───────────────────

/** Official field order per Event.Name for HMAC-SHA256 canonicalization. */
export const WEBHOOK_V2_SIGNATURE_FIELDS: Record<string, string[]> = {
  PAYMENT_STATUS_CHANGED: [
    "Invoice.Id",
    "Invoice.Status",
    "Transaction.Status",
    "Transaction.PaymentId",
    "Invoice.ExternalIdentifier",
  ],
  REFUND_STATUS_CHANGED: [
    "Refund.Id",
    "Refund.Status",
    "Amount.ValueInBaseCurrency",
    "ReferencedInvoice.Id",
  ],
  BALANCE_TRANSFERRED: [
    "Deposit.Reference",
    "Deposit.ValueInBaseCurrency",
    "Deposit.NumberOfTransactions",
  ],
  SUPPLIER_STATUS_CHANGED: ["Supplier.Code", "KycDecision.Status"],
  RECURRING_UPDATES: [
    "Recurring.Id",
    "Recurring.Status",
    "Recurring.InitialInvoiceId",
  ],
  DISPUTE_STATUS_CHANGED: [
    "Dispute.DisputeTransactionId",
    "Dispute.Status",
    "Invoice.Id",
    "Invoice.Status",
    "Transaction.Status",
    "Transaction.PaymentId",
    "Invoice.ExternalIdentifier",
  ],
  SUPPLIER_UPDATE_REQUEST_CHANGED: [
    "Supplier.Code",
    "RequestStatus.Status",
  ],
};

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function buildWebhookV2CanonicalString(
  eventName: string,
  data: Record<string, unknown>
): string {
  const fields = WEBHOOK_V2_SIGNATURE_FIELDS[eventName];
  if (!fields) {
    throw new Error(`Unknown MyFatoorah webhook event: ${eventName}`);
  }
  return fields
    .map((path) => {
      const v = getByPath(data, path);
      const value = v == null ? "" : String(v);
      return `${path}=${value}`;
    })
    .join(",");
}

export function signWebhookV2Canonical(
  canonical: string,
  secret: string
): string {
  return crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(canonical, "utf8")
    .digest("base64");
}

export type WebhookV2Body = {
  Event?: {
    Code?: number;
    Name?: string;
    CountryIsoCode?: string;
    CreationDate?: string;
    Reference?: string;
  };
  // Legacy V1 envelopes
  EventType?: number | string;
  Data?: Record<string, unknown>;
};

/**
 * Verify MyFatoorah Webhook V2 signature using event-specific canonical fields.
 * Falls back to legacy raw-body HMAC only when Event.Name is absent (V1).
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  parsedBody?: WebhookV2Body
): Promise<boolean> {
  const webhookSecret = (
    await getDecryptedEnv("MYFATOORAH_WEBHOOK_SECRET")
  ).trim();
  if (!webhookSecret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader) return false;

  let body = parsedBody;
  if (!body) {
    try {
      body = JSON.parse(rawBody) as WebhookV2Body;
    } catch {
      return false;
    }
  }

  const eventName = body.Event?.Name;
  if (eventName && body.Data) {
    try {
      const canonical = buildWebhookV2CanonicalString(
        eventName,
        body.Data as Record<string, unknown>
      );
      const expected = signWebhookV2Canonical(canonical, webhookSecret);
      const a = Buffer.from(expected);
      const b = Buffer.from(signatureHeader);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  // Legacy V1: HMAC of raw body (sandbox older integrations)
  const digest = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Stable fingerprint for webhook idempotency. */
export function webhookEventFingerprint(
  body: WebhookV2Body,
  signatureHeader: string | null
): string {
  const ref = body.Event?.Reference ?? "";
  const name = body.Event?.Name ?? String(body.EventType ?? "");
  const inv =
    (body.Data?.Invoice as { Id?: string | number } | undefined)?.Id ??
    body.Data?.InvoiceId ??
    "";
  const pay =
    (body.Data?.Transaction as { PaymentId?: string } | undefined)?.PaymentId ??
    body.Data?.PaymentId ??
    "";
  const rec =
    (body.Data?.Recurring as { Id?: string } | undefined)?.Id ??
    body.Data?.RecurringId ??
    "";
  const material = `${name}|${ref}|${inv}|${pay}|${rec}|${signatureHeader ?? ""}`;
  return crypto.createHash("sha256").update(material).digest("hex");
}

/** Verify paid amount/currency against server-side order (prevents callback tampering). */
export function amountsMatch(opts: {
  expectedSar: number;
  paidSar: number;
  expectedCurrency: string;
  paidCurrency: string | null;
  toleranceSar?: number;
}): boolean {
  const tol = opts.toleranceSar ?? 0.01;
  const currencyOk =
    (opts.paidCurrency ?? opts.expectedCurrency).toUpperCase() ===
    opts.expectedCurrency.toUpperCase();
  return (
    currencyOk && Math.abs(opts.expectedSar - opts.paidSar) <= tol
  );
}

export function appBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}
