import { createPageMetadata } from "@/lib/seo";
import { LandingPage } from "@/components/marketing/landing-page";

export const metadata = createPageMetadata({
  title: "ArabClue",
  titleAr: "أراب كلاو",
  description:
    "ArabClue — AI bid preparation for Saudi Etimad tenders. Draft technical proposals and financial structures in hours. Humans enter prices. Never AI pricing.",
  descriptionAr:
    "أراب كلاو — مساعد ذكاء اصطناعي لمناقصات اعتماد. صياغة العروض الفنية وهيكل المالي في ساعات. الأسعار يدخلها البشر فقط.",
  path: "/",
});

export default function HomePage() {
  return <LandingPage />;
}
