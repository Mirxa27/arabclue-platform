import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Pricing",
  titleAr: "الأسعار",
  description:
    "Arabclue subscription plans for Saudi tender proposal teams — Starter, Professional, and Enterprise with enforced quotas.",
  path: "/pricing",
});

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
