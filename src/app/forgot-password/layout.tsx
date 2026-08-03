import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Forgot password",
  titleAr: "استعادة كلمة المرور",
  description: "Request a secure password recovery link for your ArabClue account.",
  path: "/forgot-password",
  noIndex: true,
});

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
