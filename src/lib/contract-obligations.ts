export type ObligationRow = {
  id: string;
  text: string;
  source: string;
  status: "open" | "done";
};

export type ObligationArticle = {
  number?: number | null;
  title?: string | null;
  titleEn?: string | null;
  titleAr?: string | null;
  body?: string | null;
  bodyEn?: string | null;
  bodyAr?: string | null;
};

export type ObligationMilestone = {
  title?: string | null;
  name?: string | null;
  weeks?: number | null;
};

const OBLIGATION_RE = /obligation|shall|sla|milestone|يجب|التزام|الالتزام|التزامات|يلتزم/i;

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function articleText(article: ObligationArticle): string {
  const en = clean(article.body ?? article.bodyEn);
  const ar = clean(article.bodyAr);
  return en || ar;
}

function articleTitle(article: ObligationArticle, fallback: number): string {
  return (
    clean(article.title ?? article.titleEn) ||
    clean(article.titleAr) ||
    `Article ${fallback}`
  );
}

function isObligationArticle(article: ObligationArticle): boolean {
  return OBLIGATION_RE.test(
    [
      article.title,
      article.titleEn,
      article.titleAr,
      article.body,
      article.bodyEn,
      article.bodyAr,
    ]
      .map((value) => clean(value))
      .join(" ")
  );
}

export function extractObligations(
  articles: ObligationArticle[] | null | undefined,
  milestones?: ObligationMilestone[] | null
): ObligationRow[] {
  const rows: ObligationRow[] = [];

  for (const [index, article] of (articles ?? []).entries()) {
    if (!isObligationArticle(article)) continue;
    const text = articleText(article);
    if (!text) continue;
    const number = article.number ?? index + 1;
    rows.push({
      id: `article-${number}`,
      text,
      source: `Article ${number} - ${articleTitle(article, number)}`,
      status: "open",
    });
  }

  for (const [index, milestone] of (milestones ?? []).entries()) {
    const text = clean(milestone.title ?? milestone.name);
    if (!text) continue;
    const sourceSuffix =
      typeof milestone.weeks === "number" ? ` - ${milestone.weeks} weeks` : "";
    rows.push({
      id: `milestone-${index + 1}`,
      text,
      source: `Milestone ${index + 1}${sourceSuffix}`,
      status: "open",
    });
  }

  return rows;
}
