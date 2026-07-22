import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "For Owners",
  titleAr: "لأصحاب العمل",
  description:
    "Arabclue for workspace owners — multi-agent Etimad proposal operations, evidence-backed compliance, role-aware workspaces, and plan quotas.",
  descriptionAr:
    "أراب كلاو لأصحاب مساحات العمل — تشغيل عطاءات اعتماد بوكلاء متعددين، وامتثال مدعوم بالأدلة، وصلاحيات واضحة.",
  path: "/for-owners",
});

export default function ForOwnersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
