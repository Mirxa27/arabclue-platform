/**
 * Client-safe bilingual contract format helpers (no LLM imports).
 */

export type ContractArticle = {
  number: number;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  sourceIds?: string[];
};

export function parseContractArticles(md: string): ContractArticle[] {
  const articles: ContractArticle[] = [];
  const re =
    /###\s*Article\s+(\d+)\s*—\s*([^|]+)\|\s*المادة\s+\d+\s*—\s*([^\n]+)\n:::en\n([\s\S]*?)\n:::\n:::ar\n([\s\S]*?)\n:::/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    articles.push({
      number: Number(m[1]),
      titleEn: m[2].trim(),
      titleAr: m[3].trim(),
      bodyEn: m[4].trim(),
      bodyAr: m[5].trim(),
    });
  }
  return articles;
}

export function articleBlock(a: ContractArticle): string {
  return `### Article ${a.number} — ${a.titleEn} | المادة ${a.number} — ${a.titleAr}
:::en
${a.bodyEn}
:::
:::ar
${a.bodyAr}
:::
`;
}
