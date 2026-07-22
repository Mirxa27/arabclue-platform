import { marketingLayoutMetadata } from "@/lib/marketing/page-meta";

export const metadata = marketingLayoutMetadata("/dpa");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
