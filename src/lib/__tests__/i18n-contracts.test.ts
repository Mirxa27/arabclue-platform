import {
  COMPLETION_ERROR_CONTRACTS,
  COMPLETION_TRANSLATION_KEY_MANIFEST,
  DYNAMIC_TRANSLATION_KEY_MANIFEST,
  clearMissingTranslationRecords,
  getCompletionErrorContract,
  getDynamicTranslationKey,
  getMissingTranslationRecords,
  isCompletionErrorCode,
  isTranslationKey,
  localizationRegistry,
  resolveTranslation,
  setMissingTranslationReporter,
  tr,
  translate,
  type CompletionSurface,
  type TranslationKey,
} from "../i18n";
import type { Role } from "../types";

const PLACEHOLDER_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;
const ARABIC_SCRIPT_PATTERN = /[\u0600-\u06ff]/;

function placeholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_PATTERN)]
    .map((match) => match[1])
    .sort();
}

describe("typed platform-completion localization contracts", () => {
  const expectedSurfaces = [
    "account",
    "invitations",
    "analytics",
    "clauses",
    "templatesContracts",
    "xlsx",
    "recurringBillingReconciliation",
    "knowledge",
    "commentsPresence",
    "historyRouting",
    "marketplace",
    "readiness",
    "notifications",
    "integrityErrors",
  ] satisfies readonly CompletionSurface[];

  it("registers every completion surface with non-empty bilingual keys", () => {
    expect(Object.keys(COMPLETION_TRANSLATION_KEY_MANIFEST).sort()).toEqual(
      [...expectedSurfaces].sort(),
    );

    for (const surface of expectedSurfaces) {
      const keys = COMPLETION_TRANSLATION_KEY_MANIFEST[surface];
      expect(keys.length).toBeGreaterThan(0);

      for (const key of keys) {
        const pair = localizationRegistry[key];
        expect(pair.ar.trim().length).toBeGreaterThan(0);
        expect(pair.en.trim().length).toBeGreaterThan(0);
        expect(ARABIC_SCRIPT_PATTERN.test(pair.ar)).toBe(true);
      }
    }
  });

  it("keeps named interpolation placeholders identical in both locales", () => {
    for (const [key, pair] of Object.entries(localizationRegistry)) {
      expect(placeholders(pair.ar), `${key} Arabic placeholders`).toEqual(
        placeholders(pair.en),
      );
    }
  });

  it("closes every finite dynamic-key family over the typed registry", () => {
    for (const [family, members] of Object.entries(
      DYNAMIC_TRANSLATION_KEY_MANIFEST,
    )) {
      expect(Object.keys(members).length, family).toBeGreaterThan(0);
      for (const key of Object.values(members)) {
        expect(isTranslationKey(key), `${family}.${key}`).toBe(true);
      }
    }

    const eventKey: TranslationKey = getDynamicTranslationKey(
      "analyticsEvent",
      "PROPOSAL_CREATED",
    );
    expect(eventKey).toBe("event_proposal_created");
    expect(getDynamicTranslationKey("knowledgeRecord", "STAFF_MEMBER")).toBe(
      "knowledge_record_staff",
    );
  });

  it("closes every composed lookup family produced by application source", () => {
    // `admin_role_${role}` is composed in the admin surfaces from the `Role`
    // union, so the manifest must cover exactly that union.
    const roles = [
      "SUPER_ADMIN",
      "ADMIN",
      "BIDDER",
      "REVIEWER",
      "FINANCE",
    ] satisfies readonly Role[];

    expect(Object.keys(DYNAMIC_TRANSLATION_KEY_MANIFEST.adminRole).sort()).toEqual(
      [...roles].sort(),
    );

    for (const role of roles) {
      expect(getDynamicTranslationKey("adminRole", role)).toBe(
        `admin_role_${role}`,
      );
    }

    // The remaining completion surfaces select from finite vocabularies rather
    // than assembling key strings at call sites.
    expect(getDynamicTranslationKey("routingNotice", "VIEW_FORBIDDEN")).toBe(
      "routing_forbidden_notice",
    );
    expect(getDynamicTranslationKey("paymentState", "PAID")).toBe(
      "payment_state_paid",
    );
    expect(
      getDynamicTranslationKey("templateVariableType", "SINGLE_CHOICE"),
    ).toBe("template_variable_type_single_choice");
    expect(
      getDynamicTranslationKey("marketplaceLifecycleState", "RETIRED"),
    ).toBe("marketplace_state_retired");
    expect(getDynamicTranslationKey("readinessState", "NOT_READY")).toBe(
      "readiness_not_ready",
    );
  });

  it("builds action-specific bilingual errors for every stable completion code", () => {
    for (const code of Object.keys(COMPLETION_ERROR_CONTRACTS)) {
      expect(isCompletionErrorCode(code)).toBe(true);
      if (!isCompletionErrorCode(code)) continue;

      const contract = getCompletionErrorContract(code);
      expect(contract).toMatchObject({ ok: false, code });
      expect(contract.message.ar).toContain(":");
      expect(contract.message.en).toContain(":");
      expect(ARABIC_SCRIPT_PATTERN.test(contract.message.ar)).toBe(true);
      expect(contract.message.ar.trim().length).toBeGreaterThan(0);
      expect(contract.message.en.trim().length).toBeGreaterThan(0);
    }
  });

  it("interpolates typed UI and error values without user-facing literals", () => {
    expect(
      translate("account_delivery_sent", "ar", {
        email: "user@example.test",
      }),
    ).toBe("تم إرسال الرسالة إلى user@example.test");

    expect(
      getCompletionErrorContract("RECONCILE_PROVIDER_MISMATCH", {
        checkoutId: "checkout-42",
      }),
    ).toEqual({
      ok: false,
      code: "RECONCILE_PROVIDER_MISMATCH",
      message: {
        ar: "تعذر تنفيذ تسوية الدفع: بيانات المزود لا تطابق العملية checkout-42",
        en: "Unable to reconcile the payment: Provider data does not match checkout checkout-42",
      },
    });
  });

  it("rejects unknown registry and error identifiers through type guards", () => {
    expect(isTranslationKey("account_registration_success")).toBe(true);
    expect(isTranslationKey("completion_key_that_does_not_exist")).toBe(false);
    expect(isCompletionErrorCode("COMMENT_CONTENT_INVALID")).toBe(true);
    expect(isCompletionErrorCode("UNKNOWN_COMPLETION_ERROR")).toBe(false);
  });
});

describe("localization fallback and missing-lookup recording", () => {
  const arabicOnly = {
    probe_arabic_only: { ar: "قيمة عربية", en: "   " },
  } as const;
  const englishOnly = {
    probe_english_only: { ar: "", en: "English value" },
  } as const;

  beforeEach(() => {
    clearMissingTranslationRecords();
    // Silence the default console sink while asserting on the recorded ring.
    setMissingTranslationReporter(() => {});
  });

  afterEach(() => {
    setMissingTranslationReporter();
    clearMissingTranslationRecords();
  });

  it("renders the other locale when the active locale has no value", () => {
    expect(resolveTranslation("probe_english_only", "ar", englishOnly)).toEqual({
      value: "English value",
      resolvedLocale: "en",
      missing: true,
    });

    expect(resolveTranslation("probe_arabic_only", "en", arabicOnly)).toEqual({
      value: "قيمة عربية",
      resolvedLocale: "ar",
      missing: true,
    });
  });

  it("renders the key identifier rather than an empty string or a throw", () => {
    expect(resolveTranslation("probe_absent_key", "ar", englishOnly)).toEqual({
      value: "probe_absent_key",
      resolvedLocale: null,
      missing: true,
    });

    expect(tr("probe_absent_registry_key", "en")).toBe(
      "probe_absent_registry_key",
    );
  });

  it("records every miss with the requested key and locale", () => {
    resolveTranslation("probe_english_only", "ar", englishOnly);
    resolveTranslation("probe_absent_key", "en", englishOnly);

    expect(getMissingTranslationRecords()).toEqual([
      { key: "probe_english_only", locale: "ar", resolvedLocale: "en" },
      { key: "probe_absent_key", locale: "en", resolvedLocale: null },
    ]);
  });

  it("records no miss for a registered key in either locale", () => {
    expect(tr("appName", "ar")).toBe("أراب كلاو");
    expect(translate("readiness_ready", "en")).toBe("Platform ready");
    expect(getMissingTranslationRecords()).toEqual([]);
  });
});
