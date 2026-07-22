import { createPageMetadata } from "@/lib/seo";
import { PUBLIC_MARKETING_PAGES } from "@/lib/marketing/site-pages";

export function marketingLayoutMetadata(path: string) {
  const page = PUBLIC_MARKETING_PAGES.find((p) => p.path === path);
  if (!page) {
    return createPageMetadata({ title: "ArabClue", path });
  }
  return createPageMetadata({
    title: page.titleEn,
    titleAr: page.titleAr,
    description: page.descriptionEn,
    descriptionAr: page.descriptionAr,
    path: page.path,
  });
}
