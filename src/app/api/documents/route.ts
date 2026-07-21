import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import type { DocCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/documents?projectId=...
export async function GET(req: NextRequest) {
  const { workspace } = await getBootstrapContext();
  const projectId = req.nextUrl.searchParams.get("projectId");

  const docs = await db.uploadedDocument.findMany({
    where: {
      workspaceId: workspace.id,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true } },
      _count: { select: { versions: true } },
    },
  });

  return NextResponse.json({ documents: docs });
}

// POST /api/documents — register an uploaded file (file bytes handled by client persistence)
export async function POST(req: NextRequest) {
  try {
    const { workspace } = await getBootstrapContext();
    const body = await req.json();

    const {
      originalName,
      mimeType,
      sizeBytes,
      docCategory,
      projectId,
      storagePath,
    } = body as {
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      docCategory: DocCategory;
      projectId?: string;
      storagePath: string;
    };

    if (!originalName || !docCategory) {
      return NextResponse.json(
        { error: "originalName and docCategory are required" },
        { status: 400 }
      );
    }

    // Find or create a draft project to attach the doc to
    let projectIdResolved = projectId;
    if (!projectIdResolved) {
      let project = await db.tenderProject.findFirst({
        where: { workspaceId: workspace.id, status: "DRAFT" },
        orderBy: { createdAt: "desc" },
      });
      if (!project) {
        const user = await db.user.findFirst({
          where: { workspaces: { some: { workspaceId: workspace.id } } },
        });
        project = await db.tenderProject.create({
          data: {
            workspaceId: workspace.id,
            createdById: user!.id,
            etimadRef: `ETM-${Date.now().toString(36).toUpperCase()}`,
            title: originalName.replace(/\.[^.]+$/, ""),
            titleAr: null,
            status: "DRAFT",
            currency: "SAR",
          },
        });
      }
      projectIdResolved = project.id;
    }

    const user = await db.user.findFirst({
      where: { workspaces: { some: { workspaceId: workspace.id } } },
    });

    const doc = await db.uploadedDocument.create({
      data: {
        workspaceId: workspace.id,
        projectId: projectIdResolved,
        uploadedById: user!.id,
        originalName,
        storagePath,
        mimeType,
        sizeBytes,
        docCategory,
        parseStatus: "PARSING",
      },
    });

    // Seed a deterministic parsed summary based on category
    const summary = generateParseSummary(docCategory, originalName);
    const entities = generateEntities(docCategory);

    await db.uploadedDocument.update({
      where: { id: doc.id },
      data: { parseStatus: "PARSED", parsedSummary: summary, extractedEntities: entities },
    });

    // Create initial version record
    await db.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        storagePath,
        sizeBytes,
        changeLog: "Initial upload",
        createdBy: user!.id,
      },
    });

    return NextResponse.json({ document: { ...doc, parseStatus: "PARSED", parsedSummary: summary } });
  } catch (err) {
    console.error("[documents POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

function generateParseSummary(cat: DocCategory, name: string): string {
  const map: Record<DocCategory, string> = {
    RFP: `Parsed conditions booklet "${name}". Extracted: scope of work, evaluation criteria (technical 70% / financial 30%), SLA penalty 2%/week (max 20%), delivery milestones, bid bond 2%, performance bond 10%.`,
    TECHNICAL_SPECS: `Parsed technical specifications "${name}". Identified 14 functional requirements, 9 non-functional requirements, integration points with NPHI/Absher, accessibility WCAG 2.1 AA, and bilingual AR/EN UI mandate.`,
    IT_CONTRACT: `Parsed IT contract template "${name}". Key clauses: IP ownership (Kingdom of Saudi Arabia), limitation of liability (contract value), warranty 12 months, dispute resolution (Saudi Commercial Arbitration Center).`,
    EA_COMPLIANCE: `Parsed EA compliance requirements "${name}". Required principles: TP1 Cloud First (mandatory KSA hosting), SP1 Secure by Design (AES-256/TLS 1.3), SP2 Zero Trust. Target compliance level C1 (Full).`,
    QUALIFICATION: `Parsed qualification criteria "${name}". Required: quick liquidity ratio ≥ 1.0, Saudization ≥ 35%, similar project experience ≥ 3, ISO 27001 certification, financial standing last 3 years.`,
    FINANCIAL: `Parsed financial statements "${name}". Extracted: cash position, accounts receivable, current liabilities. Quick liquidity ratio computable. Saudization certificate attached.`,
    BRAND_ASSET: `Parsed brand asset "${name}". Extracted logo, color palette, typography. Ready for vectorization.`,
    OTHER: `Parsed document "${name}". Content indexed for retrieval.`,
  };
  return map[cat];
}

function generateEntities(cat: DocCategory): string {
  const map: Record<DocCategory, object> = {
    RFP: {
      scope: "Design, build, and operate a citizen-facing digital platform",
      slaPenalty: { perWeek: 2, maxPercent: 20 },
      milestones: [
        { name: "Mobilization", weeks: 2 },
        { name: "Discovery", weeks: 4 },
        { name: "Design", weeks: 6 },
        { name: "Build", weeks: 16 },
        { name: "UAT & Go-Live", weeks: 4 },
      ],
      evaluation: { technical: 70, financial: 30 },
    },
    TECHNICAL_SPECS: {
      functional: 14,
      nonFunctional: 9,
      integrations: ["NPHI", "Absher", "Sehaty", "NEOM Data Exchange"],
      accessibility: "WCAG 2.1 AA",
      languages: ["ar", "en"],
    },
    IT_CONTRACT: {
      ipOwnership: "Kingdom of Saudi Arabia",
      liabilityCap: "Contract value",
      warranty: "12 months",
      arbitration: "Saudi Commercial Arbitration Center",
    },
    EA_COMPLIANCE: {
      requiredLevel: "C1",
      principles: ["TP1", "SP1", "SP2"],
      hosting: "KSA sovereign cloud",
    },
    QUALIFICATION: {
      minQuickLiquidityRatio: 1.0,
      minSaudization: 35,
      minSimilarProjects: 3,
      requiredCerts: ["ISO 27001", "ISO 9001", "CMMI L3"],
    },
    FINANCIAL: {
      cash: 18500000,
      accountsReceivable: 12300000,
      currentLiabilities: 24800000,
      quickLiquidityRatio: 1.24,
    },
    BRAND_ASSET: { type: "logo", colors: ["#1E3A8A", "#0EA5E9", "#0F172A"] },
    OTHER: {},
  };
  return JSON.stringify(map[cat]);
}
