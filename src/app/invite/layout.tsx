import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Accept invitation",
  titleAr: "قبول الدعوة",
  description: "Accept a workspace invitation to join an ArabClue team.",
  path: "/invite",
  noIndex: true,
});

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
