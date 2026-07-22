/**
 * Central metadata service for App Router pages.
 * Use `createPageMetadata` from page/layout files (server-only).
 */

import type { Metadata } from "next";

export const SITE = {
  name: "Arabclue",
  nameAr: "أراب كلاو",
  nameFull: "Arabclue | أراب كلاو",
  tagline:
    "Saudi Tender Proposal Automation — Etimad, NCA, PDPL & Vision 2030",
  taglineAr:
    "أتمتة عطاءات المناقصات السعودية — اعتماد، الهيئة الوطنية، حماية البيانات، ورؤية 2030",
  description:
    "Arabclue automates the generation of compliant, attractive technical and financial proposals for all Saudi government tender types (IT, construction, consulting, operations) on the Etimad portal. NCA, PDPL & EA compliant. Vision 2030 aligned.",
  descriptionAr:
    "أراب كلاو يُؤتمت إنشاء العروض الفنية والمالية المتوافقة والجذابة لجميع أنواع المناقصات الحكومية السعودية على منصة اعتماد.",
  keywords: [
    "Arabclue",
    "أراب كلاو",
    "Etimad",
    "Saudi procurement",
    "PDPL",
    "NCA",
    "Vision 2030",
    "RFP",
    "tender proposal",
    "government tenders",
  ],
} as const;

function siteUrl(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://arabclue.sa"
  );
}

export type PageMetaInput = {
  /** Short page title (without brand suffix) */
  title: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  /** Path starting with `/`, e.g. `/for-owners` */
  path?: string;
  noIndex?: boolean;
  ogType?: "website" | "article";
};

/**
 * Build consistent Next.js `Metadata` for a route segment.
 * Titles become `{page} · Arabclue | أراب كلاو`.
 */
export function createPageMetadata(input: PageMetaInput): Metadata {
  const title = input.title;
  const description = input.description ?? SITE.description;
  const path = input.path ?? "/";
  const url = `${siteUrl()}${path === "/" ? "" : path}`;
  const fullTitle =
    path === "/" || path === ""
      ? `${SITE.nameFull} — Saudi Tender Proposal Automation`
      : `${title} · ${SITE.nameFull}`;

  return {
    title: fullTitle,
    description,
    keywords: [...SITE.keywords],
    authors: [{ name: SITE.name }],
    icons: { icon: "/logo.svg" },
    alternates: {
      canonical: url,
      languages: {
        en: url,
        ar: url,
      },
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE.nameFull,
      type: input.ogType ?? "website",
      locale: "ar_SA",
      alternateLocale: ["en_US"],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
    robots: input.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

/** Root layout defaults */
export const rootMetadata = createPageMetadata({
  title: SITE.nameFull,
  path: "/",
});
