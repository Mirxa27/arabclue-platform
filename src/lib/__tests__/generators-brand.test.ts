import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { BrandProfile, GeneratedProposal, TenderProject } from "@prisma/client";
import { brandArgb } from "../letterhead";
import {
  buildBidPackageReadme,
  generateBoQXLSX,
  generateComplianceMatrixXLSX,
  generateProposalPPTX,
  generateSlidesHTML,
} from "../generators";

const brand = {
  id: "brand-1",
  workspaceId: "workspace-1",
  logoUrl: null,
  primaryColor: "#115E59",
  secondaryColor: "#0F172A",
  accentColor: "#F59E0B",
  fontFamily: "Cairo",
  tagline: "Acme Bids",
  taglineAr: "أكمي للعطاءات",
  vision2030Alignment: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} satisfies BrandProfile;

const company = {
  name: "Acme Contracting Co.",
  nameAr: "شركة أكمي للمقاولات",
  crNumber: "1010123456",
  vatNumber: "300123456700003",
};

const project = {
  id: "project-1",
  title: "Digital Platform RFP",
  titleAr: "منافسة منصة رقمية",
  etimadRef: "ET-ACME-1",
  category: "IT",
  currency: "SAR",
  budget: 1_000_000,
  saudizationTarget: 30,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} as TenderProject;

const proposal = {
  id: "proposal-1",
  contentMd: "# Executive summary",
  version: 2,
  status: "APPROVED",
  locale: "en",
  complianceScore: 92,
  approvedAt: new Date("2026-01-02T00:00:00.000Z"),
  generatedAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} as GeneratedProposal;

async function loadWorkbook(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

describe("export brand chrome", () => {
  test("brandArgb normalizes hex colors for Office fills", () => {
    expect(brandArgb("#115E59")).toBe("FF115E59");
    expect(brandArgb("f59e0b")).toBe("FFF59E0B");
  });

  test("compliance workbook uses client brand for creator title and header fill", async () => {
    const wb = await loadWorkbook(
      await generateComplianceMatrixXLSX(project, brand, undefined, company, "en")
    );
    const ws = wb.getWorksheet("Compliance Matrix");

    expect(wb.creator).toBe("Acme Contracting Co.");
    expect(ws?.getCell("A1").value).toBe(
      "Acme Contracting Co. Compliance Matrix — Digital Platform RFP"
    );
    expect(ws?.getCell("A1").fill).toMatchObject({
      fgColor: { argb: "FF115E59" },
    });
    expect(ws?.getCell("A2").fill).toMatchObject({
      fgColor: { argb: "FF115E59" },
    });
  });

  test("BoQ workbook uses client brand for creator title and header fill", async () => {
    const wb = await loadWorkbook(
      await generateBoQXLSX(project, brand, undefined, company, "en")
    );
    const ws = wb.getWorksheet("Financial BoQ");

    expect(wb.creator).toBe("Acme Contracting Co.");
    expect(ws?.getCell("A1").value).toBe(
      "Acme Contracting Co. Financial Bill of Quantities — Digital Platform RFP"
    );
    expect(ws?.getCell("A1").fill).toMatchObject({
      fgColor: { argb: "FF115E59" },
    });
    expect(ws?.getCell("A2").fill).toMatchObject({
      fgColor: { argb: "FF115E59" },
    });
  });

  test("slides HTML uses client company name, font, and brand colors", () => {
    const html = generateSlidesHTML(proposal, project, brand, undefined, company);

    expect(html).toContain("Acme Contracting Co.");
    expect(html).toContain("font-family: 'Cairo'");
    expect(html).toContain("#115E59");
    expect(html).toContain("#F59E0B");
    expect(html).not.toContain("<div class=\"slide-title\">Arabclue</div>");
  });

  test("PPTX uses client company author, title slide, font, and brand colors", async () => {
    const pptx = await JSZip.loadAsync(
      await generateProposalPPTX(proposal, project, brand, undefined, company)
    );
    const coreXml = await pptx.file("docProps/core.xml")?.async("string");
    const slideXml = await pptx.file("ppt/slides/slide1.xml")?.async("string");

    expect(coreXml).toContain("Acme Contracting Co.");
    expect(slideXml).toContain("Acme Contracting Co.");
    expect(slideXml).toContain("Cairo");
    expect(slideXml).toContain("115E59");
    expect(slideXml).toContain("F59E0B");
  });

  test("compliance workbook uses Arabic company name when locale is ar and only nameAr is set", async () => {
    const arCompany = {
      nameAr: "شركة أكمي للمقاولات",
      crNumber: "1010123456",
    };
    const wb = await loadWorkbook(
      await generateComplianceMatrixXLSX(project, brand, undefined, arCompany, "ar")
    );
    const ws = wb.getWorksheet("Compliance Matrix");

    expect(wb.creator).toBe("شركة أكمي للمقاولات");
    expect(ws?.getCell("A1").value).toBe(
      "شركة أكمي للمقاولات Compliance Matrix — Digital Platform RFP"
    );
  });

  test("ZIP README starts with client company name", () => {
    const readme = buildBidPackageReadme({
      companyName: company.name,
      project,
      proposal,
      tenderType: { name: "IT", nameAr: "تقنية المعلومات" },
      validationStatus: "PASS",
      approvalStatus: "APPROVED",
    });

    expect(readme.split("\n")[0]).toBe("Acme Contracting Co. Bid Package");
  });
});
