/**
 * Bilingual verification-email content (requirements 1.4, 1.10, 18.1).
 *
 * Pure builder: every visible string is resolved from the `Localization_Registry`
 * in Arabic and English, the recipient's persisted locale is rendered first, and
 * interpolated values are HTML-escaped. The raw verification token appears only
 * inside the returned message body — never in a log record, an audit entry, an
 * API response, or persistence.
 */

import { escapeHtml } from "./markdown";
import { translate } from "./i18n";
import type { Locale } from "./types";

export const VERIFICATION_LINK_EXPIRY_HOURS = 24;

const BRAND_PRIMARY = "#1E3A8A";
const OTHER_LOCALE: Readonly<Record<Locale, Locale>> = { ar: "en", en: "ar" };
const DIRECTION: Readonly<Record<Locale, "rtl" | "ltr">> = {
  ar: "rtl",
  en: "ltr",
};

export type VerificationEmailInput = Readonly<{
  /** Recipient address, already normalized by the account service. */
  to: string;
  /** Recipient's persisted locale; rendered first. */
  locale: Locale;
  workspaceName: string;
  /** Absolute verification URL carrying the single-use raw token. */
  verificationUrl: string;
  expiryHours?: number;
}>;

export type VerificationEmailContent = Readonly<{
  to: string;
  locale: Locale;
  subject: string;
  html: string;
  text: string;
}>;

/** Bilingual verification message with the primary locale first. */
export function buildVerificationEmailContent(
  input: VerificationEmailInput
): VerificationEmailContent {
  const primary = input.locale;
  const secondary = OTHER_LOCALE[primary];
  const hours = normalizeExpiryHours(input.expiryHours);
  const values = {
    workspaceName: input.workspaceName,
    hours,
  } as const;

  const sections = [primary, secondary] as const;

  const subject = [
    translate("account_verification_email_subject", primary),
    translate("account_verification_email_subject", secondary),
  ].join(" — ");

  const html = [
    `<div style="font-family: IBM Plex Sans Arabic, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">`,
    ...sections.map((locale) => renderHtmlSection(locale, input, values)),
    `</div>`,
  ].join("\n");

  const text = sections
    .map((locale) => renderTextSection(locale, input, values))
    .join("\n\n");

  return { to: input.to, locale: primary, subject, html, text };
}

function renderHtmlSection(
  locale: Locale,
  input: VerificationEmailInput,
  values: Readonly<{ workspaceName: string; hours: number }>
): string {
  const url = escapeHtml(input.verificationUrl);
  return [
    `<section dir="${DIRECTION[locale]}" lang="${locale}" style="margin-block-end: 24px;">`,
    `<h1 style="font-size: 20px; font-weight: 700;">${escapeHtml(
      translate("account_verification_email_heading", locale)
    )}</h1>`,
    `<p>${escapeHtml(
      translate("account_verification_email_intro", locale, {
        workspaceName: values.workspaceName,
      })
    )}</p>`,
    `<p><a href="${url}" style="display:inline-block;padding:12px 20px;background:${BRAND_PRIMARY};color:#ffffff;border-radius:9999px;text-decoration:none;font-weight:600;">${escapeHtml(
      translate("account_verification_email_action", locale)
    )}</a></p>`,
    `<p style="font-size:12px;color:#666666;word-break:break-all;">${url}</p>`,
    `<p style="font-size:12px;color:#666666;">${escapeHtml(
      translate("account_verification_email_expiry", locale, {
        hours: values.hours,
      })
    )}</p>`,
    `<p style="font-size:12px;color:#666666;">${escapeHtml(
      translate("account_verification_email_ignore", locale)
    )}</p>`,
    `</section>`,
  ].join("\n");
}

function renderTextSection(
  locale: Locale,
  input: VerificationEmailInput,
  values: Readonly<{ workspaceName: string; hours: number }>
): string {
  return [
    translate("account_verification_email_heading", locale),
    translate("account_verification_email_intro", locale, {
      workspaceName: values.workspaceName,
    }),
    `${translate("account_verification_email_action", locale)}: ${input.verificationUrl}`,
    translate("account_verification_email_expiry", locale, {
      hours: values.hours,
    }),
    translate("account_verification_email_ignore", locale),
  ].join("\n");
}

function normalizeExpiryHours(value: number | undefined): number {
  if (value === undefined) return VERIFICATION_LINK_EXPIRY_HOURS;
  if (!Number.isSafeInteger(value) || value < 1 || value > 8_760) {
    throw new RangeError(
      "Verification link expiry must be a whole number of hours from 1 to 8760."
    );
  }
  return value;
}
