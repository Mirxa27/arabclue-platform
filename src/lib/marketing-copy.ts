export type Locale = "ar" | "en";

export const marketingDict = {
  nav: {
    home: { ar: "الرئيسية", en: "Home" },
    how: { ar: "كيف يعمل", en: "How it works" },
    features: { ar: "المميزات", en: "Features" },
    packages: { ar: "الباقات", en: "Packages" },
    pricing: { ar: "الأسعار", en: "Pricing" },
    compliance: { ar: "الامتثال", en: "Compliance" },
    owners: { ar: "لأصحاب العمل", en: "For Owners" },
  },
  hero: {
    badge: { ar: "رؤية 2030 • جاهز لمنصة اعتماد • متوافق مع NCA و PDPL", en: "Vision 2030 • Etimad Ready • NCA & PDPL Aligned" },
    title_1: { ar: "حوّل مناقصات", en: "Turn Etimad RFPs into" },
    title_2: { ar: "اعتماد إلى عطاءات جاهزة", en: "submission-ready bids" },
    title_3: { ar: "في ساعات، لا أسابيع", en: "in hours, not weeks." },
    subtitle: {
      ar: "مصنع عطاءات متعدد الوكلاء يحوّل كراسات الشروط ومئات الصفحات إلى عرض فني، مالي، ومصفوفة امتثال — عربي/إنجليزي، بهوية شركتكم، وسجل تدقيق كامل.",
      en: "A multi-agent bid factory that turns RFP packages and hundreds of pages into Technical, Financial, and Compliance Matrix — Arabic & English, branded, with full audit trail.",
    },
    cta_primary: { ar: "ابدأ مساحة العمل", en: "Start workspace" },
    cta_secondary: { ar: "شاهد كيف يعمل", en: "See how it works" },
    stats_projects: { ar: "+1,200 مشروع تمت معالجته (بيئة تجريبية)", en: "+1,200 projects processed (sandbox)" },
    stats_time: { ar: "82% وقت أقل للمسودة الأولى", en: "82% less time to first draft" },
    stats_langs: { ar: "عربي + English ثنائي اللغة", en: "Arabic + English bilingual" },
  },
  trust: {
    label: { ar: "مصمم لبيئة المناقصات الحكومية السعودية", en: "Built for Saudi gov tender operations" },
    items: [
      { ar: "منصة اعتماد", en: "Etimad Platform", code: "Etimad" },
      { ar: "الهيئة الوطنية للأمن السيبراني", en: "NCA ECC-1", code: "NCA" },
      { ar: "نظام حماية البيانات الشخصية", en: "PDPL Aligned", code: "PDPL" },
      { ar: "هيئة الزكاة والضريبة والجمارك", en: "ZATCA Compliant", code: "ZATCA" },
      { ar: "رؤية السعودية 2030", en: "Vision 2030", code: "2030" },
    ],
  },
  problem: {
    before_title: { ar: "المشكلة: المناقصة تستهلك أسابيع", en: "The problem: tenders eat weeks" },
    before_points: {
      ar: ["قراءة 400+ صفحة يدوياً", "نسخ شهادات وخبرات سابقة كل مرة", "خطر نسيان شرط امتثال واحد", "تأخير التسعير وارتباك الاعتمادات"],
      en: ["Manually reading 400+ pages", "Copy-pasting certs & past projects every time", "Risk of missing one compliance clause", "Pricing delays & approval chaos"],
    },
    after_title: { ar: "الحل: أراب كلاو يشغّل المصنع", en: "The solution: Arabclue runs the factory" },
    after_points: {
      ar: ["استيعاب ذكي يستخرج المصفوفة", "قاعدة معرفة شركتك جاهزة للـ RAG", "مصفوفة امتثال بأدلة قابلة للتدقيق", "مسارات اعتماد وهيكل مالي أنت تسعّره"],
      en: ["Smart ingest extracting the matrix", "Your company knowledge base ready for RAG", "Compliance matrix with auditable evidence", "Approval flows & financial structure you price"],
    },
  },
  features_bento: {
    section_title: { ar: "كل ما تحتاجه من الاستيعاب إلى التصدير", en: "Everything from intake to export" },
    section_sub: { ar: "ليس مولد نصوص — بل نظام تشغيل تشغيل عطاءات.", en: "Not a text generator — an operating system for bid ops." },
    items: [
      {
        title: { ar: "مصنع متعدد الوكلاء", en: "Multi-agent factory" },
        desc: { ar: "استيعاب، امتثال، صياغة فنية، وهيكلة مالية في تشغيل واحد مسيطر عليه — التسعير يبقى يدوياً دائماً.", en: "Ingestion, compliance, technical drafting, financial scaffolding in one controlled run — pricing stays manual, always." },
        tag: "Agents",
      },
      {
        title: { ar: "قاعدة معرفة الحساب", en: "Account knowledge base" },
        desc: { ar: "10 أقسام: هوية، شهادات، طاقم، منهجيات، مكتبة، شراكات، قيود — تُستخدم كـ RAG في كل عطاء.", en: "10 sections: brand, certs, staff, methodologies, library, partners, restrictions — used as RAG for every bid." },
        tag: "RAG",
      },
      {
        title: { ar: "مصفوفة متطلبات حية", en: "Live requirements matrix" },
        desc: { ar: "كل فقرة من RFP تُحوّل إلى بند قابل للتتبع مع حالة: مغطى، قيد العمل، مفقود.", en: "Every RFP clause becomes a trackable requirement with status: COVERED, IN_PROGRESS, MISSING." },
        tag: "Matrix",
      },
      {
        title: { ar: "امتثال بأدلة", en: "Evidence-backed compliance" },
        desc: { ar: "NCA، PDPL، محتوى محلي، سعودة — مع مصادر وأدلة، وليست قوائم وهمية.", en: "NCA, PDPL, local content, saudization — with sources & evidence, not checkbox theatre." },
        tag: "NCA / PDPL",
      },
      {
        title: { ar: "تصدير ثنائي اللغة بعلامتك", en: "Bilingual branded exports" },
        desc: { ar: "PDF، Excel، حزمة ZIP كاملة بهوية شركتك وألوانها — عربي وإنجليزي.", en: "PDF, Excel, full ZIP package with your brand, colors — Arabic & English." },
        tag: "Exports",
      },
      {
        title: { ar: "اعتماد وشفافية حصة", en: "Approvals & quota transparency" },
        desc: { ar: "سلسلة اعتماد فني ونهائي، ووضوح استهلاك المستندات والعطاءات قبل فشل التشغيل.", en: "Technical & final approval chain, and doc/proposal usage clarity before run fails." },
        tag: "Ops",
      },
    ],
  },
  how: {
    title: { ar: "من الرزمة إلى الحزمة في 3 خطوات", en: "From RFP bundle to bid package in 3 steps" },
    sub: { ar: "بدون مفاجآت في منتصف المناقصة.", en: "No surprises mid-tender." },
    steps: [
      { n: "01", title: { ar: "أكمل قاعدة المعرفة", en: "Complete knowledge base" }, body: { ar: "10 أقسام تهيئة، شهادات، طاقم، مكتبة، قيود. مرة واحدة، ثم يعاد استخدامها.", en: "10-part onboarding: certs, staff, library, restrictions. Once, then reused." } },
      { n: "02", title: { ar: "ارفع رزمة المناقصة", en: "Upload RFP bundle" }, body: { ar: "PDFs ومرفقات؛ يستخرج الوكلاء المصفوفة، المتطلبات، والامتثال تلقائياً.", en: "PDFs & attachments; agents auto-extract matrix, requirements, compliance." } },
      { n: "03", title: { ar: "صغ، اعتمد، صدّر", en: "Draft, approve, export" }, body: { ar: "حرر الفني، أدخل التسعير بنفسك، مرر عبر الاعتماد، حمل الحزمة.", en: "Edit technical, enter pricing yourself, route via approvals, download package." } },
    ],
  },
  pricing_teaser: {
    badge: { ar: "باقات شفافة", en: "Transparent packages" },
    title: { ar: "باقة لكل حجم فريق مناقصات", en: "A package for every bid ops team size" },
    sub: { ar: "الحصص تُفرض عند الرفع والتشغيل — لا فواتير مفاجئة.", en: "Quotas enforced at upload & run — no surprise invoices." },
    cta: { ar: "قارن جميع الميزات", en: "Compare all features" },
  },
  faqs: {
    title: { ar: "أسئلة سريعة", en: "Quick questions" },
    items: [
      { q: { ar: "هل يسعّر النظام العطاء نيابة عني؟", en: "Does system price the bid for me?" }, a: { ar: "لا. يبني الهيكل فقط (BoQ، جداول). التسعير يدخل يدوياً دائماً — هذا قرار أمني وتجاري.", en: "No. It builds structure only (BoQ, tables). Pricing is always manual — security & commercial decision." } },
      { q: { ar: "كيف يضمن الامتثال؟", en: "How is compliance ensured?" }, a: { ar: "نربط كل بند امتثال بدليل من مستنداتك أو قاعدة المعرفة، مع حالة واضحة: ملتزم / جزئي / غير ملتزم.", en: "We link each compliance control to evidence from docs or knowledge base, with clear status: COMPLIANT / PARTIAL / NON_COMPLIANT." } },
      { q: { ar: "هل يدعم العربية والإنجليزية؟", en: "AR/EN support?" }, a: { ar: "نعم. إنشاء المحتوى، التصدير، والواجهة كلها ثنائية اللغة بشكل كامل مع RTL/LTR سلس.", en: "Yes. Generation, exports, and UI are fully bilingual with smooth RTL/LTR." } },
      { q: { ar: "أين تُخزن البيانات؟", en: "Where is data stored?" }, a: { ar: "حسب المستأجر، مع عزلWorkspace. نحن نلتزم PDPL، وفريقك يتحكم بالوصول والجلسات.", en: "Tenant-scoped, workspace-isolated. PDPL-aware, your team controls access & sessions." } },
    ],
  },
  final_cta: {
    title: { ar: "جاهز لتحويل المناقصة القادمة؟", en: "Ready to turn your next tender around?" },
    sub: { ar: "ادخل مساحة العمل، أكمل 10 أقسام المعرفة، وارفع أول RFP في نفس اليوم.", en: "Enter workspace, complete 10 knowledge sections, upload first RFP today." },
    primary: { ar: "ابدأ الآن — ادخل", en: "Start now — enter" },
    secondary: { ar: "تحدث مع المبيعات", en: "Talk to sales" },
  },
} as const;

export const pricingPlans = [
  {
    code: "STARTER",
    name: { ar: "المبتدئ", en: "Starter" },
    blurb: { ar: "للمتنافسين الفرديين في البداية", en: "For solo bidders getting started" },
    priceMonthly: 299,
    priceYearly: 2990,
    highlight: false,
    cta: { ar: "ابدأ بالمبتدئ", en: "Start with Starter" },
    features: {
      ar: ["10 عطاءات شهرياً", "50 مستند", "مساحة عمل واحدة", "خط وكلاء أساسي", "تصدير PDF", "دعم بالبريد"],
      en: ["10 proposals / month", "50 documents", "1 workspace", "Core agent pipeline", "PDF export", "Email support"],
    },
    limits: { projects: "10/mo", docs: "50", workspaces: "1", support: "Email" },
  },
  {
    code: "PRO",
    name: { ar: "الاحترافي", en: "Professional" },
    blurb: { ar: "لفرق العطاءات المتنامية", en: "For growing bid teams" },
    priceMonthly: 999,
    priceYearly: 9990,
    highlight: true,
    badge: { ar: "الأكثر اختياراً", en: "Most chosen" },
    cta: { ar: "اختر الاحترافي", en: "Choose Professional" },
    features: {
      ar: ["50 عطاءاً شهرياً", "250 مستنداً · 3 مساحات", "وكلاء كاملون + هوية", "قاعدة معرفة + RAG", "تصدير PPTX/PDF/XLSX", "دعم ذو أولوية"],
      en: ["50 proposals / month", "250 docs · 3 workspaces", "Full agents + brand kit", "Knowledge base + RAG", "PPTX/PDF/XLSX export", "Priority support"],
    },
    limits: { projects: "50/mo", docs: "250", workspaces: "3", support: "Priority" },
  },
  {
    code: "ENTERPRISE",
    name: { ar: "المؤسسات", en: "Enterprise" },
    blurb: { ar: "للمؤسسات الكبيرة", en: "For large organizations" },
    priceMonthly: 2999,
    priceYearly: 29990,
    custom: false,
    highlight: false,
    cta: { ar: "ابدأ بالمؤسسات", en: "Start Enterprise" },
    features: {
      ar: ["عطاءات ومستندات بلا حد", "20 مساحة عمل", "سجل تدقيق وصلاحيات أدوار", "توجيه مخصص لمزودي الذكاء", "ضوابط جاهزة لـ SSO", "دعم مخصص"],
      en: ["Unlimited proposals & docs", "20 workspaces", "Audit trail & RBAC", "Custom AI provider routing", "SSO-ready controls", "Dedicated support"],
    },
    limits: { projects: "Unlimited", docs: "Unlimited", workspaces: "20", support: "Dedicated" },
  },
] as const;

export const pricingComparison = [
  { feature: { ar: "عطاءات / شهر", en: "Proposals / month" }, starter: "10", pro: "50", ent: "∞" },
  { feature: { ar: "رفع المستندات", en: "Document uploads" }, starter: "50", pro: "250", ent: "∞" },
  { feature: { ar: "مساحات العمل", en: "Workspaces" }, starter: "1", pro: "3", ent: "20" },
  { feature: { ar: "تخزين", en: "Storage" }, starter: "5 GB", pro: "25 GB", ent: "200 GB" },
  { feature: { ar: "تشغيل أولوية للوكلاء", en: "Priority agent runs" }, starter: false, pro: true, ent: true },
  { feature: { ar: "Version history & rewrite", en: "Version history & rewrite" }, starter: false, pro: true, ent: true },
  { feature: { ar: "أدوار فريق", en: "Team roles" }, starter: false, pro: true, ent: true },
  { feature: { ar: "RAG قاعدة المعرفة", en: "Knowledge base RAG" }, starter: "Limited", pro: true, ent: true },
  { feature: { ar: "تصدير بعلامة", en: "Branded exports" }, starter: true, pro: true, ent: true },
  { feature: { ar: "مصفوفة امتثال", en: "Compliance matrix" }, starter: true, pro: true, ent: true },
  { feature: { ar: "سجل تدقيق", en: "Audit trail" }, starter: true, pro: true, ent: true },
  { feature: { ar: "SSO", en: "SSO" }, starter: false, pro: false, ent: true },
  { feature: { ar: "دعم مخصص", en: "Dedicated support" }, starter: false, pro: false, ent: true },
];
