/**
 * Bilingual workspace-invitation email content (requirements 3.1, 18.1, 18.5).
 *
 * Pure builder that mirrors `account-verification-email.ts`: every visible
 * string comes from the `Localization_Registry` in Arabic and English, the
 * recipient locale is rendered first, and interpolated values are HTML-escaped.
 * The raw invitation token appears only inside the returned message body, never
 * in persistence, an API response, a log record, or an audit entry.
 */

import { escapeHtml } from "./markdown";
import { getDynamicTranslationKey, translate } from "./i18n";
import type { Locale } from "./types";
import type { InvitationTargetRole } from "./invitation-roles";

export const INVITATION_LINK_EXPIRY_DAYS = 7;

const BRAND_PRIMARY = "#1E3A8A";
const OTHER_LOCALE: Readonly<Record<Locale, Locale>> = { ar: "en", en: "ar" };
const DIRECTION: Readonly<Record<Locale, "rtl" | "ltr">> = {
  ar: "rtl",
  en: "ltr",
};

/** Registry member used for the localized role name in each language. */
const ROLE_MEMBER: Readonly<Record<InvitationTargetRole, "ADMINISTRATOR" | "MEMBER">> =
  {
    ADMIN: "ADMINISTRATOR",
    MEMBER: "MEMBER",
  };

export type InvitationEmailInput = Readonly<{
  /** Invited address, already normalized by the invitation service. */
  to: string;
  /** Locale rendered first; Arabic when the invitee has no persisted locale. */
  locale: Locale;
  workspaceName: string;
  role: InvitationTargetRole;
  /** Absolute acceptance URL carrying the single-use raw token. */
  invitationUrl: string;
  expiryDays?: number;
}>;

export type InvitationEmailContent = Readonly<{
  to: string;
  locale: Locale;
  subject: string;
  html: string;
  text: string;
}>;

/** Bilingual invitation message with the recipient's locale first. */
export function buildInvitationEmailContent(
  input: InvitationEmailInput
): InvitationEmailContent {
  const primary = input.locale;
  const secondary = OTHER_LOCALE[primary];
  const days = normalizeExpiryDays(input.expiryDays);
  const sections = [primary, secondary] as const;

  const subject = sections
    .map((locale) => translate("invitation_email_subject", locale))
    .join(" — ");

  const html = [
    `<div style="font-family: IBM Plex Sans Arabic, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">`,
    ...sections.map((locale) => renderHtmlSection(locale, input, days)),
    `</div>`,
  ].join("\n");

  const text = sections
    .map((locale) => renderTextSection(locale, input, days))
    .join("\n\n");

  return { to: input.to, locale: primary, subject, html, text };
}

/** Localized role name for the requested locale. */
export function localizedInvitationRole(
  role: InvitationTargetRole,
  locale: Locale
): string {
  return translate(
    getDynamicTranslationKey("invitationRole", ROLE_MEMBER[role]),
    locale
  );
}

function renderHtmlSection(
  locale: Locale,
  input: InvitationEmailInput,
  days: number
): string {
  const url = escapeHtml(input.invitationUrl);
  return [
    `<section dir="${DIRECTION[locale]}" lang="${locale}" style="margin-block-end: 24px;">`,
    `<h1 style="font-size: 20px; font-weight: 700;">${escapeHtml(
      translate("invitation_email_heading", locale)
    )}</h1>`,
    `<p>${escapeHtml(
      translate("invitation_email_intro", locale, {
        workspaceName: input.workspaceName,
        role: localizedInvitationRole(input.role, locale),
      })
    )}</p>`,
    `<p><a href="${url}" style="display:inline-block;padding:12px 20px;background:${BRAND_PRIMARY};color:#ffffff;border-radius:9999px;text-decoration:none;font-weight:600;">${escapeHtml(
      translate("invitation_email_action", locale)
    )}</a></p>`,
    `<p style="font-size:12px;color:#666666;word-break:break-all;">${url}</p>`,
    `<p style="font-size:12px;color:#666666;">${escapeHtml(
      translate("invitation_email_expiry", locale, { days })
    )}</p>`,
    `<p style="font-size:12px;color:#666666;">${escapeHtml(
      translate("invitation_email_ignore", locale)
    )}</p>`,
    `</section>`,
  ].join("\n");
}

function renderTextSection(
  locale: Locale,
  input: InvitationEmailInput,
  days: number
): string {
  return [
    translate("invitation_email_heading", locale),
    translate("invitation_email_intro", locale, {
      workspaceName: input.workspaceName,
      role: localizedInvitationRole(input.role, locale),
    }),
    `${translate("invitation_email_action", locale)}: ${input.invitationUrl}`,
    translate("invitation_email_expiry", locale, { days }),
    translate("invitation_email_ignore", locale),
  ].join("\n");
}

function normalizeExpiryDays(value: number | undefined): number {
  if (value === undefined) return INVITATION_LINK_EXPIRY_DAYS;
  if (!Number.isSafeInteger(value) || value < 1 || value > 365) {
    throw new RangeError(
      "Invitation link expiry must be a whole number of days from 1 to 365."
    );
  }
  return value;
}

/** Acceptance link carrying the single-use raw token as a query parameter. */
export function buildInvitationUrl(baseUrl: string, rawToken: string): string {
  const base = baseUrl.replace(/\/+$/u, "");
  return `${base}/invite?token=${encodeURIComponent(rawToken)}`;
}
