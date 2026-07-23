/**
 * Assemble a bilingual company business profile from onboarding knowledge,
 * and render attractive HTML / PDF capability statements.
 */

import type {
  BrandProfile,
  Certificate,
  Partnership,
  PastProject,
  StaffMember,
  TargetSector,
  Workspace,
  MethodologyAsset,
} from "@prisma/client";
import { db } from "./db";
import { computeOnboardingSteps } from "./onboarding";
import { escapeHtml } from "./markdown";

export type BusinessProfileSnapshot = {
  workspace: {
    id: string;
    name: string;
    nameAr: string | null;
    slug: string;
    plan: string;
    crNumber: string | null;
    vatNumber: string | null;
  };
  brand: {
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    tagline: string | null;
    taglineAr: string | null;
    vision2030Alignment: string | null;
  } | null;
  readiness: {
    readyForProposals: boolean;
    missing: string[];
    completedCount: number;
    totalRequired: number;
    score: number;
  };
  stats: {
    pastProjects: number;
    staff: number;
    certificates: number;
    partnerships: number;
    sectors: number;
    methodologies: number;
  };
  highlights: {
    pastProjects: Array<{
      title: string;
      titleAr: string | null;
      clientName: string | null;
      sector: string | null;
      outcome: string | null;
      summary: string;
    }>;
    staff: Array<{
      name: string;
      nameAr: string | null;
      title: string | null;
      titleAr: string | null;
    }>;
    certificates: Array<{
      name: string;
      nameAr: string | null;
      issuer: string | null;
    }>;
    partnerships: Array<{
      name: string;
      nameAr: string | null;
      kind: string | null;
    }>;
    sectors: Array<{ name: string; nameAr: string | null }>;
    methodologies: Array<{ title: string; titleAr: string | null }>;
  };
  generatedAt: string;
};

type WorkspacePack = Workspace & {
  brandProfiles: BrandProfile[];
  pastProjects: PastProject[];
  staffMembers: StaffMember[];
  certificates: Certificate[];
  partnerships: Partnership[];
  targetSectors: TargetSector[];
  methodologyAssets: MethodologyAsset[];
};

export async function loadBusinessProfile(
  workspaceId: string
): Promise<BusinessProfileSnapshot> {
  const [workspaceRaw, onboarding] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: {
        brandProfiles: { take: 1 },
        pastProjects: {
          where: { approved: true, revokedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 8,
        },
        staffMembers: {
          where: { active: true },
          orderBy: { updatedAt: "desc" },
          take: 8,
        },
        certificates: { orderBy: { updatedAt: "desc" }, take: 8 },
        partnerships: { orderBy: { updatedAt: "desc" }, take: 6 },
        targetSectors: { orderBy: { updatedAt: "desc" }, take: 8 },
        methodologyAssets: { orderBy: { updatedAt: "desc" }, take: 6 },
      },
    }),
    computeOnboardingSteps(workspaceId),
  ]);
  const workspace = workspaceRaw as WorkspacePack;

  const brand = workspace.brandProfiles[0] ?? null;
  const requiredTotal = 5;
  const completedRequired = requiredTotal - onboarding.missing.length;
  const score = Math.round((completedRequired / requiredTotal) * 100);

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      nameAr: workspace.nameAr,
      slug: workspace.slug,
      plan: workspace.plan,
      crNumber: workspace.crNumber,
      vatNumber: workspace.vatNumber,
    },
    brand: brand
      ? {
          logoUrl: brand.logoUrl,
          primaryColor: brand.primaryColor,
          secondaryColor: brand.secondaryColor,
          accentColor: brand.accentColor,
          tagline: brand.tagline,
          taglineAr: brand.taglineAr,
          vision2030Alignment: brand.vision2030Alignment,
        }
      : null,
    readiness: {
      readyForProposals: onboarding.readyForProposals,
      missing: onboarding.missing,
      completedCount: completedRequired,
      totalRequired: requiredTotal,
      score,
    },
    stats: {
      pastProjects: workspace.pastProjects.length,
      staff: workspace.staffMembers.length,
      certificates: workspace.certificates.length,
      partnerships: workspace.partnerships.length,
      sectors: workspace.targetSectors.length,
      methodologies: workspace.methodologyAssets.length,
    },
    highlights: {
      pastProjects: workspace.pastProjects.map((p) => ({
        title: p.title,
        titleAr: p.titleAr,
        clientName: p.clientName,
        sector: p.sector,
        outcome: p.outcome,
        summary: p.summary.slice(0, 280),
      })),
      staff: workspace.staffMembers.map((s) => ({
        name: s.name,
        nameAr: s.nameAr,
        title: s.roleTitle,
        titleAr: s.roleTitleAr,
      })),
      certificates: workspace.certificates.map((c) => ({
        name: c.name,
        nameAr: null,
        issuer: c.issuer,
      })),
      partnerships: workspace.partnerships.map((p) => ({
        name: p.name,
        nameAr: null,
        kind: p.partnerType,
      })),
      sectors: workspace.targetSectors.map((s) => ({
        name: s.sector,
        nameAr: null,
      })),
      methodologies: workspace.methodologyAssets.map((m) => ({
        title: m.title,
        titleAr: m.titleAr,
      })),
    },
    generatedAt: new Date().toISOString(),
  };
}

export function buildBusinessProfileHTML(
  profile: BusinessProfileSnapshot,
  opts?: { locale?: "ar" | "en"; forPrint?: boolean }
): string {
  const locale = opts?.locale ?? "ar";
  const rtl = locale === "ar";
  const forPrint = opts?.forPrint ?? true;
  const primary = profile.brand?.primaryColor ?? "#1E3A8A";
  const accent = profile.brand?.accentColor ?? "#0EA5E9";
  const secondary = profile.brand?.secondaryColor ?? "#0F172A";
  const name =
    locale === "ar"
      ? profile.workspace.nameAr || profile.workspace.name
      : profile.workspace.name;
  const tagline =
    locale === "ar"
      ? profile.brand?.taglineAr || profile.brand?.tagline || ""
      : profile.brand?.tagline || profile.brand?.taglineAr || "";

  const t =
    locale === "ar"
      ? {
          badge: "ملف الشركة · أراب كلاو",
          subtitle: "بيان قدرات ثنائي اللغة لمنافسات اعتماد",
          ready: "جاهز لتقديم العروض",
          setup: "أكمل إعداد الحساب",
          score: "اكتمال الملف",
          cr: "السجل التجاري",
          vat: "الرقم الضريبي",
          vision: "مواءمة رؤية 2030",
          track: "أبرز المشاريع",
          team: "رأس المال البشري",
          certs: "الشهادات",
          partners: "الشراكات",
          sectors: "القطاعات المستهدفة",
          methods: "المنهجيات",
          footer:
            "ملف عيّنة تشغيلي من أراب كلاو · ليس استشارة قانونية · إقامة البيانات في المملكة عند التهيئة",
          empty: "أضف بيانات من إعداد الحساب لإثراء هذا القسم",
        }
      : {
          badge: "Business Profile · ArabClue",
          subtitle: "Bilingual capability statement for Etimad-oriented bids",
          ready: "Ready for proposals",
          setup: "Finish account setup",
          score: "Profile completeness",
          cr: "Commercial registration",
          vat: "VAT number",
          vision: "Vision 2030 alignment",
          track: "Flagship projects",
          team: "Human capital",
          certs: "Certificates",
          partners: "Partnerships",
          sectors: "Target sectors",
          methods: "Methodologies",
          footer:
            "Operational profile from ArabClue · Not legal advice · KSA data residency when configured",
          empty: "Add data in Account Setup to enrich this section",
        };

  const logo = profile.brand?.logoUrl
    ? `<img src="${escapeHtml(profile.brand.logoUrl)}" alt="logo" style="height:64px;max-width:200px;object-fit:contain;background:rgba(255,255,255,.14);padding:8px 12px;border-radius:12px" />`
    : "";

  const listOrEmpty = (items: string[]) =>
    items.length
      ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
      : `<p class="empty">${escapeHtml(t.empty)}</p>`;

  const projects = profile.highlights.pastProjects.map((p) => {
    const title = locale === "ar" ? p.titleAr || p.title : p.title;
    return `<article class="card">
      <h3>${escapeHtml(title)}</h3>
      <p class="meta">${escapeHtml([p.clientName, p.sector, p.outcome].filter(Boolean).join(" · "))}</p>
      <p>${escapeHtml(p.summary)}</p>
    </article>`;
  });

  const staff = profile.highlights.staff.map((s) => {
    const n = locale === "ar" ? s.nameAr || s.name : s.name;
    const role = locale === "ar" ? s.titleAr || s.title : s.title;
    return `${n}${role ? ` — ${role}` : ""}`;
  });

  const certs = profile.highlights.certificates.map((c) => {
    const n = locale === "ar" ? c.nameAr || c.name : c.name;
    return c.issuer ? `${n} (${c.issuer})` : n;
  });

  const partners = profile.highlights.partnerships.map((p) => {
    const n = locale === "ar" ? p.nameAr || p.name : p.name;
    return p.kind ? `${n} · ${p.kind}` : n;
  });

  const sectors = profile.highlights.sectors.map((s) =>
    locale === "ar" ? s.nameAr || s.name : s.name
  );

  const methods = profile.highlights.methodologies.map((m) =>
    locale === "ar" ? m.titleAr || m.title : m.title
  );

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(name)} — ${escapeHtml(t.badge)}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  :root { --p:${primary}; --a:${accent}; --s:${secondary}; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: #0f172a;
    font-family: ${rtl ? "'IBM Plex Sans Arabic'" : "'Space Grotesk'"}, 'IBM Plex Sans Arabic', system-ui, sans-serif;
    background:
      radial-gradient(ellipse 70% 40% at 0% 0%, color-mix(in oklab, var(--a) 18%, transparent), transparent),
      radial-gradient(ellipse 50% 35% at 100% 0%, color-mix(in oklab, var(--p) 16%, transparent), transparent),
      #f8fafc;
    font-size: 12.5px; line-height: 1.6;
  }
  .wrap { max-width: 920px; margin: 0 auto; padding: 28px 22px 48px; }
  .hero {
    background: linear-gradient(135deg, var(--p), color-mix(in oklab, var(--a) 70%, var(--p)));
    color: #fff; border-radius: 18px; padding: 32px 28px; margin-bottom: 22px;
    box-shadow: 0 18px 40px rgba(15,23,42,.18);
  }
  .hero .badge { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; opacity: .85; font-weight: 700; }
  .hero h1 { margin: 10px 0 6px; font-size: 28px; line-height: 1.2; }
  .hero .tag { font-size: 14px; opacity: .92; max-width: 40rem; }
  .pillrow { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .pill {
    background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22);
    border-radius: 999px; padding: 5px 12px; font-size: 11px; font-weight: 600;
  }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
  .stat {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px;
  }
  .stat b { display: block; font-size: 22px; color: var(--p); }
  .stat span { color: #64748b; font-size: 11px; }
  h2 {
    margin: 22px 0 10px; font-size: 16px; color: var(--s);
    border-inline-start: 3px solid var(--a); padding-inline-start: 10px;
  }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .card {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px;
    break-inside: avoid;
  }
  .card h3 { margin: 0 0 4px; font-size: 14px; }
  .card .meta { color: #64748b; font-size: 11px; margin: 0 0 8px; }
  .panel {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 18px; margin-bottom: 12px;
  }
  ul { margin: 6px 0 0; padding-inline-start: 18px; }
  .empty { color: #94a3b8; font-style: italic; }
  .foot { margin-top: 28px; text-align: center; color: #94a3b8; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  ${forPrint ? "" : `.actions{position:fixed;inset-inline-end:16px;top:16px;z-index:5}.actions button{background:var(--p);color:#fff;border:0;border-radius:10px;padding:10px 14px;font:inherit;cursor:pointer}`}
  @media (max-width: 720px) {
    .grid, .cards { grid-template-columns: 1fr; }
    .hero h1 { font-size: 22px; }
  }
</style>
</head>
<body>
  <div class="wrap">
    ${forPrint ? "" : `<div class="actions"><button onclick="window.print()">PDF</button></div>`}
    <header class="hero">
      ${logo}
      <div class="badge">${escapeHtml(t.badge)}</div>
      <h1>${escapeHtml(name)}</h1>
      <p class="tag">${escapeHtml(tagline || t.subtitle)}</p>
      <div class="pillrow">
        <span class="pill">${profile.readiness.readyForProposals ? t.ready : t.setup}</span>
        <span class="pill">${t.score}: ${profile.readiness.score}%</span>
        ${profile.workspace.crNumber ? `<span class="pill">${t.cr}: ${escapeHtml(profile.workspace.crNumber)}</span>` : ""}
        ${profile.workspace.vatNumber ? `<span class="pill">${t.vat}: ${escapeHtml(profile.workspace.vatNumber)}</span>` : ""}
        ${profile.brand?.vision2030Alignment ? `<span class="pill">${t.vision}</span>` : ""}
      </div>
    </header>

    <section class="grid">
      <div class="stat"><b>${profile.stats.pastProjects}</b><span>${t.track}</span></div>
      <div class="stat"><b>${profile.stats.staff}</b><span>${t.team}</span></div>
      <div class="stat"><b>${profile.stats.certificates}</b><span>${t.certs}</span></div>
      <div class="stat"><b>${profile.stats.partnerships}</b><span>${t.partners}</span></div>
      <div class="stat"><b>${profile.stats.sectors}</b><span>${t.sectors}</span></div>
      <div class="stat"><b>${profile.stats.methodologies}</b><span>${t.methods}</span></div>
    </section>

    ${
      profile.brand?.vision2030Alignment
        ? `<div class="panel"><strong>${escapeHtml(t.vision)}</strong><p>${escapeHtml(profile.brand.vision2030Alignment)}</p></div>`
        : ""
    }

    <h2>${escapeHtml(t.track)}</h2>
    <div class="cards">${projects.join("") || `<div class="panel empty">${escapeHtml(t.empty)}</div>`}</div>

    <h2>${escapeHtml(t.team)}</h2>
    <div class="panel">${listOrEmpty(staff)}</div>

    <h2>${escapeHtml(t.certs)}</h2>
    <div class="panel">${listOrEmpty(certs)}</div>

    <h2>${escapeHtml(t.partners)}</h2>
    <div class="panel">${listOrEmpty(partners)}</div>

    <h2>${escapeHtml(t.sectors)}</h2>
    <div class="panel">${listOrEmpty(sectors)}</div>

    <h2>${escapeHtml(t.methods)}</h2>
    <div class="panel">${listOrEmpty(methods)}</div>

    <div class="foot">${escapeHtml(t.footer)} · ${escapeHtml(profile.generatedAt.slice(0, 10))}</div>
  </div>
</body>
</html>`;
}

export async function generateBusinessProfilePDF(
  profile: BusinessProfileSnapshot,
  locale: "ar" | "en" = "ar"
): Promise<Buffer> {
  let htmlProfile = profile;
  if (profile.brand?.logoUrl?.startsWith("/")) {
    try {
      const { readStoredFile, fileExists } = await import("./storage");
      const pathMatch = profile.brand.logoUrl.match(/path=([^&]+)/);
      if (pathMatch) {
        const storagePath = decodeURIComponent(pathMatch[1]);
        if (await fileExists(storagePath)) {
          const bytes = await readStoredFile(storagePath);
          const ext = storagePath.split(".").pop()?.toLowerCase() ?? "png";
          const mime =
            ext === "jpg" || ext === "jpeg"
              ? "image/jpeg"
              : ext === "webp"
                ? "image/webp"
                : ext === "svg"
                  ? "image/svg+xml"
                  : "image/png";
          htmlProfile = {
            ...profile,
            brand: {
              ...profile.brand,
              logoUrl: `data:${mime};base64,${bytes.toString("base64")}`,
            },
          };
        }
      }
    } catch {
      /* keep relative */
    }
  }

  const html = buildBusinessProfileHTML(htmlProfile, {
    locale,
    forPrint: true,
  });
  const { htmlToPdf } = await import("./pdf/html-to-pdf");
  return htmlToPdf(html, {
    format: "A4",
    printBackground: true,
    waitMs: 450,
    headerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;padding:0 12mm;">ArabClue · Business Profile</div>`,
    footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;padding:0 12mm;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  });
}
