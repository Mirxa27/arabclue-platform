import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Reset password",
  titleAr: "إعادة تعيين كلمة المرور",
  description: "Set a new password using your ArabClue recovery link.",
  path: "/reset-password",
  noIndex: true,
});

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
