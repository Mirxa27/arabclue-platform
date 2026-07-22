import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Packages & Pricing",
  titleAr: "الباقات والأسعار",
  description:
    "ArabClue packages: Starter SAR 299, Professional SAR 999, Enterprise SAR 2,999 monthly — quotas enforced at upload and agent run.",
  path: "/pricing",
});

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
