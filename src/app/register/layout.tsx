import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Create account",
  titleAr: "إنشاء حساب",
  description: "Create your ArabClue workspace for Saudi Etimad tender proposals.",
  path: "/register",
  noIndex: true,
});

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
