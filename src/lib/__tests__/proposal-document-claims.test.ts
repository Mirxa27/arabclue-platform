import { expect, test } from "bun:test";
import { generateProposalHTMLPreview } from "../generators";

test("Arabic proposal output does not assert an unverified hosting location", () => {
  const proposal = {
    contentMd: "# نطاق العمل\nمحتوى موثق",
    locale: "ar",
    title: "Technical proposal",
    titleAr: "العرض الفني",
    version: 1,
    generatedAt: new Date("2026-07-24T12:00:00.000Z"),
    updatedAt: new Date("2026-07-24T12:00:00.000Z"),
  } as Parameters<typeof generateProposalHTMLPreview>[0];
  const project = {
    title: "Verified project",
    category: "IT_SERVICES",
    budget: 1_000,
    currency: "SAR",
    etimadRef: "RFP-2026-18",
  } as Parameters<typeof generateProposalHTMLPreview>[1];

  const html = generateProposalHTMLPreview(
    proposal,
    project,
    null,
    "ar",
    {
      name: "Verified bidder",
      nameAr: "مقدم عرض موثق",
      crNumber: null,
      vatNumber: null,
    }
  ).toString("utf8");

  expect(html).not.toContain("إقامة البيانات في المملكة");
  expect(html).not.toContain("توطين البيانات");
  expect(html).toContain("مواءمة رؤية 2030 عند وجود سند");
  expect(html).toContain("ليست استشارة قانونية");
});
