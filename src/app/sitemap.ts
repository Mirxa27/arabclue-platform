import type { MetadataRoute } from "next";
import { PUBLIC_MARKETING_PAGES } from "@/lib/marketing/site-pages";

function siteUrl(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://arabclue.com"
  );
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return PUBLIC_MARKETING_PAGES.map((page) => ({
    url: `${base}${page.path === "/" ? "" : page.path}`,
    lastModified: now,
    changeFrequency: page.path === "/" ? "weekly" : "monthly",
    priority: page.path === "/" ? 1 : page.group === "legal" ? 0.4 : 0.7,
  }));
}
