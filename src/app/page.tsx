import { cookies } from "next/headers";
import { createPageMetadata } from "@/lib/seo";
import { LandingPage } from "@/components/marketing/landing-page";
import { LOCALE_COOKIE_NAME } from "@/lib/store";

export const metadata = createPageMetadata({
  title: "ArabClue",
  titleAr: "أراب كلاو",
  description:
    "ArabClue — AI bid preparation for Saudi Etimad tenders. Draft technical proposals and financial structures in hours. Humans enter prices. Never AI pricing.",
  descriptionAr:
    "أراب كلاو — مساعد ذكاء اصطناعي لمناقصات اعتماد. صياغة العروض الفنية وهيكل المالي في ساعات. الأسعار يدخلها البشر فقط.",
  path: "/",
});

export default async function HomePage() {
  const cookieStore = await cookies();
  const initialLocale =
    cookieStore.get(LOCALE_COOKIE_NAME)?.value === "en" ? "en" : "ar";
  return <LandingPage initialLocale={initialLocale} />;
}
