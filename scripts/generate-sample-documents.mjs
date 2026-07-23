#!/usr/bin/env node
/**
 * Generate bilingual (EN|AR) Saudi sample tender/contract documents
 * as HTML + PDF under examples/sample-documents/.
 *
 * Usage: bun scripts/generate-sample-documents.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "examples", "sample-documents");
const HTML_DIR = path.join(OUT, "html");
const PDF_DIR = path.join(OUT, "pdf");

const CSS = `
  :root {
    --ink: #0c1222;
    --muted: #5b6478;
    --line: #d8dee9;
    --accent: #1e3a8a;
    --accent-2: #0ea5e9;
    --teal: #0f766e;
    --paper: #f7f8fb;
    --panel: #ffffff;
    --warn: #b45309;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    background:
      radial-gradient(ellipse 80% 45% at 0% 0%, rgba(30,58,138,0.08), transparent),
      radial-gradient(ellipse 55% 35% at 100% 0%, rgba(14,165,233,0.07), transparent),
      var(--paper);
    font-family: "Space Grotesk", "IBM Plex Sans Arabic", system-ui, sans-serif;
    font-size: 12.5px;
    line-height: 1.55;
  }
  .wrap { max-width: 920px; margin: 0 auto; padding: 28px 24px 48px; }
  .banner {
    display: flex; justify-content: space-between; gap: 16px; align-items: flex-start;
    border: 1px solid #fcd34d; background: #fffbeb; color: #92400e;
    border-radius: 10px; padding: 10px 14px; margin-bottom: 18px; font-size: 11px;
  }
  .mast {
    display: grid; grid-template-columns: 1fr auto; gap: 16px;
    border-bottom: 2px solid var(--ink); padding-bottom: 16px; margin-bottom: 22px;
  }
  .brand { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
  h1 {
    margin: 6px 0 4px; font-size: 22px; line-height: 1.25;
    font-family: "IBM Plex Sans Arabic", sans-serif;
  }
  .h1-en { margin: 0; font-size: 14px; color: var(--muted); font-weight: 600; }
  .meta { text-align: end; font-size: 11px; color: var(--muted); }
  .meta strong { color: var(--ink); display: block; font-size: 12px; }
  .chip {
    display: inline-block; margin-top: 6px; padding: 3px 8px; border-radius: 999px;
    background: #eff6ff; color: #1e40af; font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
  }
  h2 {
    margin: 22px 0 10px; font-size: 15px;
    font-family: "IBM Plex Sans Arabic", sans-serif;
    border-right: 3px solid var(--accent-2); padding-right: 10px;
  }
  h2 .en { display: block; font-size: 11px; color: var(--muted); font-weight: 600; margin-top: 2px;
    font-family: "Space Grotesk", sans-serif; border: 0; padding: 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; background: var(--panel); }
  th, td { border: 1px solid var(--line); padding: 8px 10px; vertical-align: top; text-align: start; }
  th { background: #eef2ff; font-size: 11px; }
  .bi {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 10px 0 16px;
  }
  .col {
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px;
  }
  .col .lang {
    display: inline-block; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
    font-weight: 700; color: var(--teal); margin-bottom: 6px;
  }
  .col.ar { direction: rtl; text-align: right; font-family: "IBM Plex Sans Arabic", sans-serif; }
  .col.en { direction: ltr; text-align: left; }
  ul { margin: 6px 0 0; padding-inline-start: 18px; }
  .sig {
    display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px;
  }
  .sig .box {
    border-top: 1px solid var(--line); padding-top: 12px; min-height: 90px; font-size: 11px; color: var(--muted);
  }
  .foot {
    margin-top: 28px; padding-top: 12px; border-top: 1px dashed var(--line);
    font-size: 10px; color: var(--muted);
  }
  .art { margin: 14px 0; page-break-inside: avoid; }
  .art header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
  .art .num {
    width: 36px; height: 36px; border-radius: 10px; background: var(--teal); color: #fff;
    display: grid; place-items: center; font-weight: 700; font-size: 12px; flex-shrink: 0;
  }
  .kv { display: grid; grid-template-columns: 160px 1fr; gap: 6px 12px; font-size: 12px; margin: 8px 0; }
  .kv span:first-child { color: var(--muted); }
  @media print {
    body { background: #fff; }
    .banner { break-inside: avoid; }
  }
`;

function shell({ titleAr, titleEn, ref, docType, body }) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titleAr} · ${titleEn}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />
<style>${CSS}</style>
</head>
<body>
  <div class="wrap">
    <div class="banner">
      <div><strong>عيّنة تدريبية / SAMPLE ONLY</strong> — وثيقة وهمية لأغراض العرض والتجربة على منصة أراب كلاو. ليست صادرة عن جهة حكومية ولا تُستخدم للتقديم الرسمي.</div>
      <div style="direction:ltr;text-align:left"><strong>FICTIONAL</strong> — Demo fixture for ArabClue. Not an official government instrument.</div>
    </div>
    <header class="mast">
      <div>
        <div class="brand">ArabClue Sample Pack · حزمة العينات</div>
        <h1>${titleAr}</h1>
        <p class="h1-en">${titleEn}</p>
        <span class="chip">${docType}</span>
      </div>
      <div class="meta">
        <strong>${ref}</strong>
        المملكة العربية السعودية<br/>Kingdom of Saudi Arabia<br/>
        تاريخ الإصدار / Issued: 2026-07-01
      </div>
    </header>
    ${body}
    <div class="foot">
      ArabClue sample documents · EN|AR · Vision 2030 / Etimad-oriented demo content · © sample data only
    </div>
  </div>
</body>
</html>`;
}

function bi(en, ar) {
  return `<div class="bi">
  <div class="col en" lang="en" dir="ltr"><span class="lang">English</span>${en}</div>
  <div class="col ar" lang="ar" dir="rtl"><span class="lang">العربية</span>${ar}</div>
</div>`;
}

function h2(ar, en) {
  return `<h2>${ar}<span class="en">${en}</span></h2>`;
}

const docs = [
  {
    id: "01-etimad-rfp-cloud-services",
    category: "RFP",
    titleAr: "كراسة شروط منافسة — خدمات الحوسبة السحابية الحكومية",
    titleEn: "Etimad-style RFP — Government Cloud Hosting Services",
    ref: "ETIMAD-SAMPLE-2026-0142",
    docType: "RFP / كراسة شروط",
    body: `
      ${h2("بيانات المنافسة", "Tender particulars")}
      <table>
        <tr><th>البند / Item</th><th>العربية</th><th>English</th></tr>
        <tr><td>الجهة / Entity</td><td>هيئة التحول الرقمي (عيّنة)</td><td>Digital Transformation Authority (sample)</td></tr>
        <tr><td>المرجع / Reference</td><td>منافسة رقم 2026/142</td><td>Competition No. 2026/142</td></tr>
        <tr><td>التصنيف / Category</td><td>تقنية معلومات — سحابة</td><td>IT — Cloud services</td></tr>
        <tr><td>آخر موعد / Closing</td><td>١٥ أغسطس ٢٠٢٦ · 14:00 الرياض</td><td>15 Aug 2026 · 14:00 Asia/Riyadh</td></tr>
        <tr><td>مدة العقد / Term</td><td>٣٦ شهراً (+١٢ خيار تمديد)</td><td>36 months (+12 extension option)</td></tr>
        <tr><td>المحتوى المحلي / Local content</td><td>الحد الأدنى المستهدف ٤٠٪</td><td>Minimum target 40%</td></tr>
        <tr><td>السعودة / Saudization</td><td>نطاق أخضر متوسط فأعلى</td><td>Nitaqat Medium Green or higher</td></tr>
      </table>
      ${h2("نطاق العمل", "Scope of work")}
      ${bi(
        `<p>Provide secure IaaS/PaaS capacity in KSA data residency regions, 24×7 SOC monitoring, identity federation with Nafath-ready SSO patterns, backup/DR (RPO ≤ 1h, RTO ≤ 4h), and bilingual operations runbooks.</p>
         <ul><li>ISO 27001 + SOC 2 Type II evidence</li><li>NCA ECC Essential Controls mapping</li><li>PDPL data residency & DPA draft</li><li>Monthly SLA credits reporting</li></ul>`,
        `<p>توفير سعات IaaS/PaaS آمنة داخل مناطق إقامة بيانات في المملكة، مراقبة SOC على مدار الساعة، اتحاد هوية متوافق مع أنماط نفاذ، نسخ احتياطي وتعافٍ (RPO ≤ ساعة، RTO ≤ ٤ ساعات)، ودليل تشغيل ثنائي اللغة.</p>
         <ul><li>أدلة ISO 27001 و SOC 2 Type II</li><li>مواءمة ضوابط الهيئة الوطنية للأمن السيبراني ECC</li><li>إقامة بيانات PDPL ومسودة اتفاقية معالجة</li><li>تقارير اعتمادات SLA شهرية</li></ul>`
      )}
      ${h2("معايير التقييم", "Evaluation criteria")}
      <table>
        <tr><th>%</th><th>المعيار / Criterion</th><th>Notes</th></tr>
        <tr><td>40</td><td>العرض الفني / Technical</td><td>Architecture, security, ops</td></tr>
        <tr><td>30</td><td>التأهيل والامتثال / Qualification & compliance</td><td>CR, ZATCA, Nitaqat, NCA</td></tr>
        <tr><td>20</td><td>المحتوى المحلي / Local content</td><td>Declared LC plan</td></tr>
        <tr><td>10</td><td>منهجية التنفيذ / Delivery method</td><td>Mobilization ≤ 45 days</td></tr>
      </table>
      ${h2("مستندات مطلوبة", "Required submissions")}
      ${bi(
        `<ul>
          <li>Technical proposal (EN|AR)</li>
          <li>Financial qualification pack (structure only — no bid pricing in this demo)</li>
          <li>Compliance matrix vs NCA ECC / PDPL</li>
          <li>Signed integrity & conflict declarations</li>
        </ul>`,
        `<ul>
          <li>العرض الفني (عربي|إنجليزي)</li>
          <li>حزمة التأهيل المالي (هيكل فقط — بدون تسعير في هذه العيّنة)</li>
          <li>مصفوفة امتثال لضوابط NCA وPDPL</li>
          <li>إقرارات النزاهة وتعارض المصالح</li>
        </ul>`
      )}
    `,
  },
  {
    id: "02-it-services-agreement",
    category: "IT_CONTRACT",
    titleAr: "عقد خدمات تقنية معلومات",
    titleEn: "IT Managed Services Agreement",
    ref: "CTR-SAMPLE-MSA-2026-008",
    docType: "CONTRACT / عقد",
    body: `
      ${bi(
        `<p><strong>Parties.</strong> This sample agreement is between <em>Digital Transformation Authority (Sample)</em> (“Client”) and <em>Najm Digital Systems Co.</em> CR 1010XXXXXX (“Provider”).</p>`,
        `<p><strong>الأطراف.</strong> هذه الاتفاقية العيّنة بين <em>هيئة التحول الرقمي (عيّنة)</em> («العميل») و<em>شركة نجم للأنظمة الرقمية</em> س.ت ١٠١٠×××××× («المزود»).</p>`
      )}
      ${[
        [
          "01",
          "التعريفات",
          "Definitions",
          "Key terms include Services, Deliverables, Confidential Information, Personal Data, Force Majeure, and Governing Law (Kingdom of Saudi Arabia).",
          "تشمل المصطلحات الأساسية: الخدمات، المخرجات، المعلومات السرية، البيانات الشخصية، القوة القاهرة، والقانون الواجب التطبيق (المملكة العربية السعودية).",
        ],
        [
          "02",
          "نطاق الخدمات",
          "Scope of services",
          "Provider shall deliver managed cloud operations, security monitoring, and bilingual support as described in Annex A (SOW).",
          "يلتزم المزود بتقديم تشغيل سحابي مُدار، ومراقبة أمنية، ودعم ثنائي اللغة وفق الملحق أ (نطاق العمل).",
        ],
        [
          "03",
          "مدة العقد والتجديد",
          "Term & renewal",
          "Initial term of thirty-six (36) months commencing on the Effective Date, with one optional twelve (12) month extension by written notice.",
          "المدة الأولية ستة وثلاثون (٣٦) شهراً من تاريخ النفاذ، مع خيار تمديد واحد لمدة اثني عشر (١٢) شهراً بإشعار كتابي.",
        ],
        [
          "04",
          "السرية وحماية البيانات",
          "Confidentiality & data protection",
          "Parties shall comply with the Personal Data Protection Law (PDPL) and applicable NCA controls. Data shall remain in KSA unless Client approves a lawful transfer.",
          "يلتزم الطرفان بنظام حماية البيانات الشخصية والضوابط السيبرانية المعمول بها. تبقى البيانات داخل المملكة ما لم يوافق العميل على نقل مشروع.",
        ],
        [
          "05",
          "مستويات الخدمة",
          "Service levels",
          "Availability target 99.9% monthly for production workloads. Service credits apply per Annex B; credits are the exclusive remedy for SLA shortfalls.",
          "هدف التوافر ٩٩٫٩٪ شهرياً لأحمال الإنتاج. تُطبَّق اعتمادات الخدمة وفق الملحق ب وتكون التعويض الحصري عن قصور SLA.",
        ],
        [
          "06",
          "القانون والاختصاص",
          "Governing law & venue",
          "This Agreement is governed by the laws of the Kingdom of Saudi Arabia. Disputes are subject to the competent courts in Riyadh, unless amicable settlement succeeds within thirty (30) days.",
          "يخضع هذا العقد لأنظمة المملكة العربية السعودية. تختص محاكم الرياض بالنزاعات ما لم يُسوَّ ودياً خلال ثلاثين (٣٠) يوماً.",
        ],
      ]
        .map(
          ([num, ar, en, bodyEn, bodyAr]) => `
        <article class="art">
          <header>
            <div class="num">${num}</div>
            <div><strong>${ar}</strong><div class="h1-en">${en}</div></div>
          </header>
          ${bi(`<p>${bodyEn}</p>`, `<p>${bodyAr}</p>`)}
        </article>`
        )
        .join("")}
      <div class="sig">
        <div class="box">توقيع العميل / Client signature<br/><br/>الاسم / Name: ____________<br/>التاريخ / Date: ____________</div>
        <div class="box">توقيع المزود / Provider signature<br/><br/>الاسم / Name: ____________<br/>التاريخ / Date: ____________</div>
      </div>
    `,
  },
  {
    id: "03-technical-specifications",
    category: "TECHNICAL_SPECS",
    titleAr: "المواصفات الفنية — منصة سحابية مؤمّنة",
    titleEn: "Technical Specifications — Secured Cloud Platform",
    ref: "SPEC-SAMPLE-CLOUD-2026",
    docType: "TECHNICAL_SPECS / مواصفات فنية",
    body: `
      ${h2("المتطلبات المعمارية", "Architecture requirements")}
      <table>
        <tr><th>ID</th><th>المتطلب / Requirement</th><th>القبول / Acceptance</th></tr>
        <tr><td>ARCH-01</td><td>مراكز بيانات داخل المملكة / KSA regions only</td><td>Evidence of region pins</td></tr>
        <tr><td>ARCH-02</td><td>فصل بيئات Dev/Test/Prod</td><td>Network & IAM diagrams</td></tr>
        <tr><td>ARCH-03</td><td>تشفير أثناء النقل والتخزين (TLS1.2+ / AES-256)</td><td>Config screenshots + HSM notes</td></tr>
        <tr><td>SEC-01</td><td>مصادقة متعددة العوامل للمسؤولين</td><td>MFA policy export</td></tr>
        <tr><td>SEC-02</td><td>سجلات تدقيق مركزية ≥ ١٨ شهراً</td><td>Retention policy</td></tr>
        <tr><td>OPS-01</td><td>نسخ احتياطي يومي + اختبار استعادة ربع سنوي</td><td>Runbook + last drill report</td></tr>
      </table>
      ${h2("مؤشرات الأداء", "Performance indicators")}
      ${bi(
        `<ul>
          <li>API p95 latency ≤ 250 ms (Riyadh region)</li>
          <li>Patch critical CVEs ≤ 7 days</li>
          <li>Change success rate ≥ 98%</li>
        </ul>`,
        `<ul>
          <li>زمن استجابة API عند p95 ≤ ٢٥٠ مللي ثانية (منطقة الرياض)</li>
          <li>معالجة ثغرات حرجة خلال ≤ ٧ أيام</li>
          <li>نسبة نجاح التغييرات ≥ ٩٨٪</li>
        </ul>`
      )}
    `,
  },
  {
    id: "04-financial-statements-excerpt",
    category: "FINANCIAL",
    titleAr: "مقتطف القوائم المالية — لأغراض التأهيل",
    titleEn: "Financial Statements Excerpt — Qualification Only",
    ref: "FIN-SAMPLE-QLR-2025",
    docType: "FINANCIAL / قوائم مالية",
    body: `
      ${bi(
        `<p>Sample balance-sheet excerpt for <strong>Najm Digital Systems Co.</strong> FY2025 (SAR thousands). For QLR / liquidity demos only — not audited statements.</p>`,
        `<p>مقتطف عيّنة من الميزانية لـ<strong>شركة نجم للأنظمة الرقمية</strong> للسنة المالية ٢٠٢٥ (آلاف الريالات). لأغراض عرض نسبة التأهيل/السيولة فقط — ليست قوائم مراجعة.</p>`
      )}
      <table>
        <tr><th>البند / Line</th><th>2025</th><th>2024</th></tr>
        <tr><td>النقد وما في حكمه / Cash & equivalents</td><td>18,450</td><td>14,220</td></tr>
        <tr><td>الذمم المدينة / Accounts receivable</td><td>9,870</td><td>8,410</td></tr>
        <tr><td>الموجودات المتداولة / Current assets</td><td>32,100</td><td>27,050</td></tr>
        <tr><td>المطلوبات المتداولة / Current liabilities</td><td>11,240</td><td>10,880</td></tr>
        <tr><td>حقوق الملكية / Equity</td><td>41,600</td><td>36,900</td></tr>
        <tr><td>الإيرادات / Revenue</td><td>62,300</td><td>54,100</td></tr>
      </table>
      ${h2("ملاحظات التأهيل", "Qualification notes")}
      ${bi(
        `<p>Illustrative current ratio ≈ 2.86. Use only to exercise ArabClue financial qualification parsing — do not treat as investment advice.</p>`,
        `<p>نسبة التداول التقريبية ≈ ٢٫٨٦. للاختبار على محرك التأهيل المالي في أراب كلاو فقط — وليست نصيحة استثمارية.</p>`
      )}
    `,
  },
  {
    id: "05-local-content-saudization",
    category: "QUALIFICATION",
    titleAr: "إقرار المحتوى المحلي والسعودة",
    titleEn: "Local Content & Saudization Declaration",
    ref: "LC-SAMPLE-DECL-2026",
    docType: "QUALIFICATION / تأهيل",
    body: `
      ${h2("ملخص المحتوى المحلي", "Local content summary")}
      <table>
        <tr><th>المكوّن / Component</th><th>المستهدف / Target</th><th>المصرّح / Declared</th></tr>
        <tr><td>القوى العاملة / Workforce</td><td>45%</td><td>48%</td></tr>
        <tr><td>المشتريات المحلية / Local procurement</td><td>35%</td><td>37%</td></tr>
        <tr><td>التدريب ونقل المعرفة / Training & knowledge transfer</td><td>Plan required</td><td>Attached</td></tr>
      </table>
      ${h2("السعودة (نطاقات)", "Saudization (Nitaqat)")}
      ${bi(
        `<div class="kv"><span>Entity size</span><span>Medium enterprise (sample)</span>
        <span>Nitaqat band</span><span>Medium Green</span>
        <span>Saudi % (ops)</span><span>42%</span>
        <span>Certificate ref</span><span>NITAQAT-SAMPLE-7781</span></div>`,
        `<div class="kv"><span>حجم المنشأة</span><span>منشأة متوسطة (عيّنة)</span>
        <span>نطاق</span><span>أخضر متوسط</span>
        <span>نسبة السعوديين (تشغيل)</span><span>٤٢٪</span>
        <span>مرجع الشهادة</span><span>NITAQAT-SAMPLE-7781</span></div>`
      )}
      ${bi(
        `<p>We declare the above figures are illustrative sample data prepared for ArabClue demos and training.</p>`,
        `<p>نُقر بأن الأرقام أعلاه بيانات عيّنة توضيحية مُعدّة لعروض وتدريب أراب كلاو.</p>`
      )}
    `,
  },
  {
    id: "06-nca-pdpl-compliance-checklist",
    category: "EA_COMPLIANCE",
    titleAr: "قائمة امتثال — ضوابط NCA و نظام PDPL",
    titleEn: "Compliance Checklist — NCA Controls & PDPL",
    ref: "CMP-SAMPLE-NCA-PDPL-2026",
    docType: "EA_COMPLIANCE / امتثال",
    body: `
      <table>
        <tr><th>Control</th><th>الوصف / Description</th><th>Status</th></tr>
        <tr><td>ECC-1-1</td><td>حوكمة الأمن السيبراني / Cybersecurity governance</td><td>COVERED</td></tr>
        <tr><td>ECC-2-3</td><td>إدارة هويات وصلاحيات / Identity & access</td><td>COVERED</td></tr>
        <tr><td>ECC-3-2</td><td>حماية البيانات والخصوصية / Data protection</td><td>IN_PROGRESS</td></tr>
        <tr><td>ECC-4-1</td><td>إدارة الحوادث / Incident management</td><td>COVERED</td></tr>
        <tr><td>PDPL-Art5</td><td>أسس المعالجة المشروعة / Lawful processing bases</td><td>COVERED</td></tr>
        <tr><td>PDPL-Art29</td><td>نقل البيانات عبر الحدود / Cross-border transfer</td><td>MISSING (needs DPA)</td></tr>
        <tr><td>NORA</td><td>توطين البيانات الحساسة للجهة / Sensitive residency</td><td>COVERED</td></tr>
      </table>
      ${h2("ملاحظات", "Notes")}
      ${bi(
        `<p>Map each control to evidence IDs in the bid package. Gaps must be closed before Client acceptance.</p>`,
        `<p>اربط كل ضابط بمعرّفات الأدلة في حزمة العرض. يجب إغلاق الفجوات قبل قبول العميل.</p>`
      )}
    `,
  },
  {
    id: "07-nda-confidentiality-agreement",
    category: "IT_CONTRACT",
    titleAr: "اتفاقية عدم إفشاء وسرية",
    titleEn: "Mutual Non-Disclosure Agreement",
    ref: "NDA-SAMPLE-2026-019",
    docType: "CONTRACT / اتفاقية سرية",
    body: `
      ${bi(
        `<p>Between <strong>Digital Transformation Authority (Sample)</strong> and <strong>Najm Digital Systems Co.</strong> effective 1 July 2026, for exchanging tender and proposal materials.</p>`,
        `<p>بين <strong>هيئة التحول الرقمي (عيّنة)</strong> و<strong>شركة نجم للأنظمة الرقمية</strong> اعتباراً من ١ يوليو ٢٠٢٦، لغرض تبادل مواد المنافسة والعروض.</p>`
      )}
      ${[
        [
          "الغرض",
          "Purpose",
          "Permit evaluation of a potential engagement without creating a duty to award.",
          "تمكين تقييم تعاقد محتمل دون إنشاء التزام بالترسية.",
        ],
        [
          "مدة السرية",
          "Confidentiality term",
          "Three (3) years from disclosure, except trade secrets which remain protected while secret.",
          "ثلاث (٣) سنوات من الإفصاح، باستثناء الأسرار التجارية التي تبقى محمية ما دامت سرية.",
        ],
        [
          "الاستثناءات",
          "Exclusions",
          "Information that is public, independently developed, or required by competent Saudi authorities.",
          "المعلومات العامة، أو المطوّرة بشكل مستقل، أو المطلوبة من جهات سعودية مختصة.",
        ],
      ]
        .map(
          ([ar, en, bodyEn, bodyAr]) =>
            `${h2(ar, en)}${bi(`<p>${bodyEn}</p>`, `<p>${bodyAr}</p>`)}`
        )
        .join("")}
      <div class="sig">
        <div class="box">الطرف الأول / Party A<br/><br/>____________</div>
        <div class="box">الطرف الثاني / Party B<br/><br/>____________</div>
      </div>
    `,
  },
  {
    id: "08-qualification-commercial-registration",
    category: "QUALIFICATION",
    titleAr: "ملخص السجل التجاري",
    titleEn: "Commercial Registration Summary",
    ref: "CR-SAMPLE-1010XXXXXX",
    docType: "QUALIFICATION / سجل تجاري",
    body: `
      <table>
        <tr><th>الحقل / Field</th><th>القيمة / Value</th></tr>
        <tr><td>الاسم التجاري / Trade name</td><td>نجم للأنظمة الرقمية / Najm Digital Systems</td></tr>
        <tr><td>رقم السجل / CR number</td><td>1010XXXXXX (sample)</td></tr>
        <tr><td>الكيان / Form</td><td>شركة ذات مسؤولية محدودة / LLC</td></tr>
        <tr><td>المدينة / City</td><td>الرياض / Riyadh</td></tr>
        <tr><td>النشاط / Activity</td><td>خدمات تقنية معلومات واستشارات</td></tr>
        <tr><td>رأس المال / Capital</td><td>SAR 5,000,000</td></tr>
        <tr><td>تاريخ الانتهاء / Expiry</td><td>1448/12/30 H ≈ 2027-05-28</td></tr>
      </table>
      ${bi(
        `<p>This is a fictional CR summary for onboarding demos. Verify real CR data via official Ministry of Commerce channels.</p>`,
        `<p>هذا ملخص سجل تجاري وهمي لعروض الإعداد. تحقّق من السجلات الحقيقية عبر قنوات وزارة التجارة الرسمية.</p>`
      )}
    `,
  },
  {
    id: "09-zatca-vat-certificate",
    category: "FINANCIAL",
    titleAr: "شهادة تسجيل ضريبة القيمة المضافة (عيّنة)",
    titleEn: "ZATCA VAT Registration Certificate (Sample)",
    ref: "VAT-SAMPLE-300XXXXXX00003",
    docType: "FINANCIAL / ZATCA",
    body: `
      ${bi(
        `<div class="kv">
          <span>Taxpayer name</span><span>Najm Digital Systems Co.</span>
          <span>VAT number</span><span>300XXXXXX00003</span>
          <span>Effective date</span><span>01/01/2023</span>
          <span>Address</span><span>Olaya St, Riyadh 12213, KSA</span>
        </div>`,
        `<div class="kv">
          <span>اسم المكلف</span><span>شركة نجم للأنظمة الرقمية</span>
          <span>الرقم الضريبي</span><span>٣٠٠××××××٠٠٠٠٣</span>
          <span>تاريخ السريان</span><span>٠١/٠١/٢٠٢٣</span>
          <span>العنوان</span><span>شارع العليا، الرياض ١٢٢١٣، المملكة</span>
        </div>`
      )}
      ${h2("إقرار", "Declaration")}
      ${bi(
        `<p>Issued for ArabClue qualification demos. Not a ZATCA original. Do not present to tax authorities.</p>`,
        `<p>صادرة لعروض التأهيل على أراب كلاو. ليست أصل هيئة الزكاة والضريبة والجمارك. لا تُقدَّم للجهات الضريبية.</p>`
      )}
    `,
  },
  {
    id: "10-sow-digital-transformation",
    category: "RFP",
    titleAr: "نطاق عمل — برنامج التحول الرقمي للخدمات البلدية",
    titleEn: "Scope of Work — Municipal Services Digital Transformation",
    ref: "SOW-SAMPLE-MUNI-2026",
    docType: "RFP / نطاق عمل",
    body: `
      ${h2("الأهداف", "Objectives")}
      ${bi(
        `<ul>
          <li>Digitize permit intake with bilingual citizen UX</li>
          <li>Integrate national identity verification patterns</li>
          <li>Publish open performance dashboards for Vision 2030 KPIs</li>
        </ul>`,
        `<ul>
          <li>رقمنة استقبال التصاريح بواجهة مواطن ثنائية اللغة</li>
          <li>دمج أنماط التحقق من الهوية الوطنية</li>
          <li>نشر لوحات أداء مفتوحة لمؤشرات رؤية ٢٠٣٠</li>
        </ul>`
      )}
      ${h2("المراحل", "Phases")}
      <table>
        <tr><th>Phase</th><th>المخرجات / Deliverables</th><th>المدة / Duration</th></tr>
        <tr><td>1 Discovery</td><td>As-is / to-be + risk register</td><td>6 weeks</td></tr>
        <tr><td>2 Build</td><td>MVP permits + integrations</td><td>16 weeks</td></tr>
        <tr><td>3 Harden</td><td>Security test + training</td><td>6 weeks</td></tr>
        <tr><td>4 Operate</td><td>Hypercare + SLA handover</td><td>8 weeks</td></tr>
      </table>
      ${h2("قيود الامتثال", "Compliance constraints")}
      ${bi(
        `<p>Solution must honor PDPL, applicable NCA ECC controls, and municipal records retention schedules. Arabic is the authoritative UI language; English is supporting.</p>`,
        `<p>يجب أن يراعي الحل نظام حماية البيانات الشخصية وضوابط NCA المعمول بها وجداول حفظ السجلات البلدية. العربية لغة الواجهة المعتمدة؛ والإنجليزية مساندة.</p>`
      )}
    `,
  },
];

async function main() {
  await mkdir(HTML_DIR, { recursive: true });
  await mkdir(PDF_DIR, { recursive: true });

  const manifest = [];
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const doc of docs) {
      const html = shell(doc);
      const htmlPath = path.join(HTML_DIR, `${doc.id}.html`);
      const pdfPath = path.join(PDF_DIR, `${doc.id}.pdf`);
      await writeFile(htmlPath, html, "utf8");

      const page = await browser.newPage();
      await page.emulateMedia({ media: "print" });
      await page.setContent(html, { waitUntil: "networkidle", timeout: 60_000 });
      await delay(400);
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;padding:0 12mm;">ArabClue Sample · عيّنة</div>`,
        footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;padding:0 12mm;"><span class="pageNumber"></span> / <span class="totalPages"></span> · ${doc.ref}</div>`,
        margin: { top: "16mm", bottom: "18mm", left: "12mm", right: "12mm" },
      });
      await page.close();
      await writeFile(pdfPath, pdf);

      manifest.push({
        id: doc.id,
        category: doc.category,
        titleEn: doc.titleEn,
        titleAr: doc.titleAr,
        ref: doc.ref,
        html: `html/${doc.id}.html`,
        pdf: `pdf/${doc.id}.pdf`,
        bytes: pdf.length,
      });
      console.log(`✓ ${doc.id} (${pdf.length} bytes)`);
    }
  } finally {
    await browser.close();
  }

  await writeFile(
    path.join(OUT, "manifest.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), documents: manifest }, null, 2) +
      "\n",
    "utf8"
  );

  const readme = `# Sample Saudi documents (EN | AR)

Bilingual demo fixtures for ArabClue — Etimad-oriented RFPs, contracts, compliance, and qualification packs.

> **SAMPLE / عيّنة فقط** — Fictional content for demos and tests. Not official government documents. Do not submit to Etimad, ZATCA, or courts.

## Contents

| # | File | Category | Description |
|---|------|----------|-------------|
${manifest
  .map(
    (m, i) =>
      `| ${i + 1} | \`${m.id}\` | \`${m.category}\` | ${m.titleEn}<br/>${m.titleAr} |`
  )
  .join("\n")}

## Formats

- \`html/\` — printable bilingual HTML (open in a browser)
- \`pdf/\` — A4 PDFs generated via Playwright
- \`manifest.json\` — machine-readable index (ids, categories, paths)

## How to use in ArabClue

1. Sign in to the workspace.
2. Create or open a tender project.
3. Upload one or more PDFs from \`pdf/\` (start with \`01-etimad-rfp-cloud-services.pdf\`).
4. Mission Control / classifiers should route by filename + content cues (\`مناقصة\`, \`عقد\`, \`PDPL\`, etc.).

Suggested upload sets:

- **Full bid intake:** \`01\`, \`03\`, \`04\`, \`05\`, \`06\`, \`08\`, \`09\`
- **Contract review:** \`02\`, \`07\`
- **Municipal SOW path:** \`10\` + \`06\`

## Regenerate

\`\`\`bash
bun scripts/generate-sample-documents.mjs
\`\`\`

Requires Playwright Chromium (\`bunx playwright install chromium\`).
`;

  await writeFile(path.join(OUT, "README.md"), readme, "utf8");
  console.log(`\nWrote ${manifest.length} documents → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
