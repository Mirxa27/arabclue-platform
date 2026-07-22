import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Compliance",
  titleAr: "الامتثال",
  description:
    "How Arabclue supports NCA, PDPL, audit trails, and evidence-backed local-content controls for Saudi government tenders.",
  path: "/compliance",
});

export default function ComplianceMarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
