import type { SendEmailInput, SendEmailResult } from "../../email";
import type {
  cancelRecurringPayment,
  createRecurringPayment,
  getPaymentStatus,
  resumeRecurringPayment,
} from "../../myfatoorah";

type MaybePromise<T> = T | Promise<T>;
type CreateRecurringPayment = typeof createRecurringPayment;
type GetPaymentStatus = typeof getPaymentStatus;
type CancelRecurringPayment = typeof cancelRecurringPayment;
type ResumeRecurringPayment = typeof resumeRecurringPayment;

export const PROVIDER_CREDENTIAL_ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_FROM",
  "EMAIL_FROM",
  // The SMTP transport dials a real relay over TLS, which the fetch-based
  // network guard below cannot intercept. Clearing these is what keeps a test
  // run from authenticating against the live mailbox.
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "MYFATOORAH_API_KEY",
  "MYFATOORAH_API_URL",
  "MYFATOORAH_MODE",
  "MYFATOORAH_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "OPENROUTER_API_KEY",
  "ZAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "AUTH_TOKEN",
] as const;

export function clearProviderCredentials(
  environment: Record<string, string | undefined> = process.env,
): void {
  for (const key of PROVIDER_CREDENTIAL_ENV_KEYS) delete environment[key];
}

export type EmailProviderMock = Readonly<{
  calls: readonly SendEmailInput[];
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>;
}>;

export function createEmailProviderMock(options?: {
  result?: SendEmailResult | ((input: SendEmailInput) => MaybePromise<SendEmailResult>);
}): EmailProviderMock {
  const calls: SendEmailInput[] = [];
  const fallback: SendEmailResult = {
    ok: true,
    id: "test-email-message-1",
    provider: "resend",
  };

  return {
    calls,
    sendEmail: async (input) => {
      calls.push(input);
      const configured = options?.result ?? fallback;
      return typeof configured === "function"
        ? configured(input)
        : configured;
    },
  };
}

type BillingProviderOverrides = Readonly<{
  createRecurringPayment?: (
    input: Parameters<CreateRecurringPayment>[0],
  ) => MaybePromise<Awaited<ReturnType<CreateRecurringPayment>>>;
  getPaymentStatus?: (
    input: Parameters<GetPaymentStatus>[0],
  ) => MaybePromise<Awaited<ReturnType<GetPaymentStatus>>>;
  cancelRecurringPayment?: (
    recurringId: Parameters<CancelRecurringPayment>[0],
  ) => MaybePromise<Awaited<ReturnType<CancelRecurringPayment>>>;
  resumeRecurringPayment?: (
    recurringId: Parameters<ResumeRecurringPayment>[0],
  ) => MaybePromise<Awaited<ReturnType<ResumeRecurringPayment>>>;
}>;

export type BillingProviderMock = Readonly<{
  calls: Readonly<{
    createRecurringPayment: readonly Parameters<CreateRecurringPayment>[0][];
    getPaymentStatus: readonly Parameters<GetPaymentStatus>[0][];
    cancelRecurringPayment: readonly string[];
    resumeRecurringPayment: readonly string[];
  }>;
  createRecurringPayment: CreateRecurringPayment;
  getPaymentStatus: GetPaymentStatus;
  cancelRecurringPayment: CancelRecurringPayment;
  resumeRecurringPayment: ResumeRecurringPayment;
}>;

export function createBillingProviderMock(
  overrides: BillingProviderOverrides = {},
): BillingProviderMock {
  const createCalls: Parameters<CreateRecurringPayment>[0][] = [];
  const statusCalls: Parameters<GetPaymentStatus>[0][] = [];
  const cancelCalls: string[] = [];
  const resumeCalls: string[] = [];

  const mock: BillingProviderMock = {
    calls: {
      createRecurringPayment: createCalls,
      getPaymentStatus: statusCalls,
      cancelRecurringPayment: cancelCalls,
      resumeRecurringPayment: resumeCalls,
    },
    createRecurringPayment: async (input) => {
      createCalls.push(input);
      if (overrides.createRecurringPayment) {
        return overrides.createRecurringPayment(input);
      }
      return {
        invoiceId: "test-invoice-1",
        paymentUrl: "https://example.invalid/test-payment",
        customerReference: input.customerReference,
        recurringId: "test-recurring-1",
      };
    },
    getPaymentStatus: async (input) => {
      statusCalls.push(input);
      if (overrides.getPaymentStatus) return overrides.getPaymentStatus(input);
      return {
        invoiceId: input.key,
        invoiceStatus: "Pending",
        invoiceValue: 0,
        customerReference: null,
        paymentId: null,
        paymentMethod: null,
        paidCurrency: "SAR",
        isPaid: false,
        isFailed: false,
        isPending: true,
        raw: { source: "test-provider-mock" },
      };
    },
    cancelRecurringPayment: async (recurringId) => {
      cancelCalls.push(recurringId);
      if (overrides.cancelRecurringPayment) {
        return overrides.cancelRecurringPayment(recurringId);
      }
      return true;
    },
    resumeRecurringPayment: async (recurringId) => {
      resumeCalls.push(recurringId);
      if (overrides.resumeRecurringPayment) {
        return overrides.resumeRecurringPayment(recurringId);
      }
      return true;
    },
  };

  return mock;
}

function networkUrl(input: Parameters<typeof fetch>[0]): URL {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  return new URL(raw, "http://127.0.0.1");
}

export function assertTestNetworkTargetAllowed(
  input: Parameters<typeof fetch>[0],
): void {
  const target = networkUrl(input);
  if (target.protocol === "data:" || target.protocol === "blob:") return;

  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (
    (target.protocol === "http:" || target.protocol === "https:") &&
    (hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "::1")
  ) {
    return;
  }

  throw new Error(
    `EXTERNAL_NETWORK_BLOCKED: completion tests cannot contact ${target.hostname || target.protocol}`,
  );
}

export function installNoExternalNetworkGuard(): () => void {
  const originalFetch = globalThis.fetch;
  const priorDeterministic = process.env.ARABCLUE_LLM_DETERMINISTIC;
  // Completion tests must not hit Neon provider rows / live LLM APIs.
  process.env.ARABCLUE_LLM_DETERMINISTIC = "1";
  clearProviderCredentials();

  const guardedFetch: typeof fetch = async (input, init) => {
    assertTestNetworkTargetAllowed(input);
    return originalFetch(input, init);
  };
  globalThis.fetch = guardedFetch;

  return () => {
    if (globalThis.fetch === guardedFetch) globalThis.fetch = originalFetch;
    if (priorDeterministic === undefined) {
      delete process.env.ARABCLUE_LLM_DETERMINISTIC;
    } else {
      process.env.ARABCLUE_LLM_DETERMINISTIC = priorDeterministic;
    }
  };
}
