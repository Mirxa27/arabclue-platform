import { describe, expect, test } from "bun:test";
import { extractObligations } from "../contract-obligations";

describe("contract obligation extraction", () => {
  test("creates rows from obligation articles, keyword bodies, and milestone titles", () => {
    const rows = extractObligations(
      [
        {
          title: "Article 4 - Obligations",
          titleAr: "المادة 4 - الالتزامات",
          body: "Vendor maintains the service desk during business hours.",
          bodyAr: "يلتزم المتعاقد بتوفير الدعم خلال ساعات العمل.",
        },
        {
          title: "Service levels",
          body: "The supplier shall meet the SLA response times in the tender.",
        },
        {
          title: "Reporting",
          bodyAr: "يجب تقديم تقرير شهري عن مستوى الخدمة.",
        },
      ],
      [{ name: "Go-live readiness", weeks: 12 }]
    );

    expect(rows).toEqual([
      {
        id: "article-1",
        text: "Vendor maintains the service desk during business hours.",
        source: "Article 1 - Article 4 - Obligations",
        status: "open",
      },
      {
        id: "article-2",
        text: "The supplier shall meet the SLA response times in the tender.",
        source: "Article 2 - Service levels",
        status: "open",
      },
      {
        id: "article-3",
        text: "يجب تقديم تقرير شهري عن مستوى الخدمة.",
        source: "Article 3 - Reporting",
        status: "open",
      },
      {
        id: "milestone-1",
        text: "Go-live readiness",
        source: "Milestone 1 - 12 weeks",
        status: "open",
      },
    ]);
  });

  test("returns an empty register for empty inputs", () => {
    expect(extractObligations([], [])).toEqual([]);
    expect(extractObligations(undefined, undefined)).toEqual([]);
  });
});
