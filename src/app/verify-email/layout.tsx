import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Verify email",
  titleAr: "تأكيد البريد الإلكتروني",
  description: "Confirm your ArabClue account email address.",
  path: "/verify-email",
  noIndex: true,
});

export default function VerifyEmailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
