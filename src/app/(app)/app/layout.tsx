import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Workspace",
  description: "Arabclue tender proposal workspace dashboard.",
  path: "/app",
  noIndex: true,
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
