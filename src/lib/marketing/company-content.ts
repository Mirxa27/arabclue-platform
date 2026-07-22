import type { DocSection, FaqItem, RelatedLink } from "@/components/marketing/doc-page";

export const aboutContent = {
  activePath: "/about",
  titleEn: "About ArabClue",
  titleAr: "عن أراب كلاو",
  summaryEn:
    "A bid-preparation platform for Saudi and GCC tenders — evidence-backed drafts, never AI-priced bids.",
  summaryAr:
    "منصة إعداد عطاءات لمناقصات المملكة والخليج — مسودات مسنودة بالأدلة، دون تسعير بالذكاء الاصطناعي.",
  heroAccent: "warm" as const,
  related: [
    { href: "/for-owners", labelEn: "For owners", labelAr: "لأصحاب العمل" },
    { href: "/compliance", labelEn: "Compliance", labelAr: "الامتثال" },
    { href: "/security", labelEn: "Security", labelAr: "الأمن" },
    { href: "/contact", labelEn: "Contact", labelAr: "تواصل" },
  ] satisfies RelatedLink[],
  sections: [
    {
      titleEn: "What we build",
      titleAr: "ما نبنيه",
      paragraphsEn: [
        "ArabClue (أراب كلاو) is a multi-tenant SaaS that helps bid teams turn Etimad-oriented RFPs into submission-ready technical packages: ingestion, requirements coverage, compliance matrices, structure-only financial forms, and bilingual drafting.",
        "Humans remain the final authors. Agents assist; they do not replace licensed professional judgment.",
      ],
      paragraphsAr: [
        "أراب كلاو منصة SaaS متعددة المستأجرين تساعد فرق العطاءات على تحويل طلبات العروض الموجهة لاعتماد إلى حزم فنية جاهزة للتقديم: استيعاب، تغطية المتطلبات، مصفوفات امتثال، نماذج مالية هيكلية فقط، وصياغة ثنائية اللغة.",
        "يبقى البشر المؤلفين النهائيين. يساعد الوكلاء ولا يحلّون محل الحكم المهني المرخص.",
      ],
    },
    {
      titleEn: "What we refuse to do",
      titleAr: "ما نرفض فعله",
      bulletsEn: [
        "No AI bid pricing, margins, discounts, or commercial strategy.",
        "No inventing certifications, staff, or past projects without account evidence.",
        "No presenting compliance commentary as legal advice.",
        "No direct Etimad portal submission API (out of scope).",
      ],
      bulletsAr: [
        "لا تسعير عطاء ولا هوامش ولا خصومات ولا استراتيجية تجارية بالذكاء الاصطناعي.",
        "لا اختراع شهادات أو طاقم أو مشاريع سابقة دون أدلة في الحساب.",
        "لا تقديم تعليقات الامتثال كاستشارة قانونية.",
        "لا واجهة تقديم مباشرة إلى بوابة اعتماد (خارج النطاق).",
      ],
    },
    {
      titleEn: "Who it is for",
      titleAr: "لمن هي",
      paragraphsEn: [
        "Bid managers, technical writers, reviewers, and finance users at organizations that submit government and private-sector tenders in Saudi Arabia and the wider GCC.",
      ],
      paragraphsAr: [
        "مديرو العطاءات والكتّاب الفنيون والمراجعون ومستخدمو المالية في الجهات التي تقدّم عطاءات حكومية وخاصة في المملكة والخليج.",
      ],
    },
  ] satisfies DocSection[],
};

export const securityContent = {
  activePath: "/security",
  titleEn: "Security",
  titleAr: "الأمن",
  summaryEn:
    "Tenant isolation, MFA, audit trails, and operational controls for regulated bid teams.",
  summaryAr:
    "عزل المستأجرين والمصادقة الثنائية وسجلات التدقيق والضوابط التشغيلية لفرق العطاءات الخاضعة للتنظيم.",
  heroAccent: "blue" as const,
  related: [
    { href: "/privacy", labelEn: "Privacy", labelAr: "الخصوصية" },
    { href: "/dpa", labelEn: "DPA", labelAr: "ملحق المعالجة" },
    { href: "/compliance", labelEn: "Compliance", labelAr: "الامتثال" },
    { href: "/contact", labelEn: "Report an issue", labelAr: "الإبلاغ عن مشكلة" },
  ] satisfies RelatedLink[],
  sections: [
    {
      titleEn: "Tenant isolation",
      titleAr: "عزل المستأجرين",
      paragraphsEn: [
        "Projects, documents, proposals, and knowledge assets are scoped to workspace membership. Cross-tenant identifiers are rejected at the API boundary.",
      ],
      paragraphsAr: [
        "تُقيَّد المشاريع والمستندات والعطاءات وأصول المعرفة بعضوية مساحة العمل. وتُرفض معرفات المستأجرين المتقاطعة عند حدود واجهة البرمجة.",
      ],
    },
    {
      titleEn: "Identity and access",
      titleAr: "الهوية والوصول",
      bulletsEn: [
        "Credential authentication with optional TOTP MFA.",
        "Role gates: bidder, reviewer (read-only except decisions), finance, admin, super-admin.",
        "Forced password change flows for provisioned accounts.",
      ],
      bulletsAr: [
        "مصادقة ببيانات الدخول مع مصادقة ثنائية TOTP اختيارية.",
        "حوافز أدوار: مناقص، مراجع (قراءة فقط باستثناء القرارات)، مالية، مسؤول، مشرف عام.",
        "مسارات فرض تغيير كلمة المرور للحسابات المُنشأة.",
      ],
    },
    {
      titleEn: "Application controls",
      titleAr: "ضوابط التطبيق",
      bulletsEn: [
        "Immutable audit log for administrative and sensitive actions.",
        "Safe ZIP intake with path-traversal and extension guards.",
        "Export manifests with content hashes for package integrity.",
        "LLM guardrails against pricing suggestions and toxic output.",
      ],
      bulletsAr: [
        "سجل تدقيق غير قابل للتغيير لإجراءات الإدارة والإجراءات الحساسة.",
        "استيعاب ZIP آمن مع حماية من اجتياز المسارات والامتدادات.",
        "بيانات بيان تصدير مع بصمات محتوى لسلامة الحزمة.",
        "حواجز نماذج اللغة ضد اقتراحات التسعير والمخرجات الضارة.",
      ],
    },
    {
      titleEn: "Payments",
      titleAr: "المدفوعات",
      paragraphsEn: [
        "Billing uses MyFatoorah only. Webhook signatures are verified; secrets are stored encrypted in environment settings and never returned in admin GET responses.",
      ],
      paragraphsAr: [
        "تستخدم الفوترة ماي فاتورة فقط. تُتحقق تواقيع الويب هوك؛ وتُخزَّن الأسرار مشفّرة في إعدادات البيئة ولا تُعاد في استجابات المسؤول.",
      ],
    },
    {
      titleEn: "Reporting",
      titleAr: "الإبلاغ",
      paragraphsEn: [
        "Suspected vulnerabilities: security@arabclue.com. Please include steps to reproduce and avoid accessing other tenants’ data.",
      ],
      paragraphsAr: [
        "الثغرات المشتبه بها: security@arabclue.com. يُرجى تضمين خطوات إعادة الإنتاج وتجنّب الوصول إلى بيانات مستأجرين آخرين.",
      ],
    },
  ] satisfies DocSection[],
};

export const faqItems: FaqItem[] = [
  {
    qEn: "Does ArabClue price my bid?",
    qAr: "هل تسعّر أراب كلاو عطائي؟",
    aEn: "No. Agents structure financial forms and BoQ lines without unit prices. Humans enter commercial amounts. Guardrails refuse pricing requests.",
    aAr: "لا. يهيكل الوكلاء النماذج المالية وبنود الكميات دون أسعار وحدات. يدخل البشر المبالغ التجارية. وترفض الحواجز طلبات التسعير.",
  },
  {
    qEn: "Is compliance output legal advice?",
    qAr: "هل مخرجات الامتثال استشارة قانونية؟",
    aEn: "No. Matrices and regulatory notes are assisted drafting aids. Authorized human legal review is required before submission.",
    aAr: "لا. المصفوفات والملاحظات التنظيمية أدوات صياغة مساعدة. يلزم مراجعة قانونية بشرية معتمدة قبل التقديم.",
  },
  {
    qEn: "How do I get an account?",
    qAr: "كيف أحصل على حساب؟",
    aEn: "Workspaces are provisioned by platform or tenant administrators. Sign in at /login with credentials issued for your organization.",
    aAr: "تُنشأ مساحات العمل من مسؤولي المنصة أو المستأجر. سجّل الدخول من /login ببيانات صادرة لمؤسستك.",
  },
  {
    qEn: "What languages are supported?",
    qAr: "ما اللغات المدعومة؟",
    aEn: "The product UI and drafts support Arabic and English (RTL-aware). Section headings can be bilingual.",
    aAr: "واجهة المنتج والمسودات تدعم العربية والإنجليزية (مع مراعاة الاتجاه). ويمكن أن تكون عناوين الأقسام ثنائية اللغة.",
  },
  {
    qEn: "Which payment provider do you use?",
    qAr: "ما مزوّد الدفع المستخدم؟",
    aEn: "MyFatoorah only (including Saudi production hosts). Activate plans from billing inside the workspace.",
    aAr: "ماي فاتورة فقط (بما في ذلك مضيفات الإنتاج السعودية). فعّل الباقات من الفوترة داخل مساحة العمل.",
  },
  {
    qEn: "Can I export a proposal package?",
    qAr: "هل يمكن تصدير حزمة العطاء؟",
    aEn: "Yes — PDF, PPTX, XLSX, and ZIP packages with branding. Final export may require approval and validation gates.",
    aAr: "نعم — حزم PDF وPPTX وXLSX وZIP مع الهوية البصرية. قد يتطلب التصدير النهائي اعتماداً وبوابات تحقق.",
  },
  {
    qEn: "Where is data hosted?",
    qAr: "أين تُستضاف البيانات؟",
    aEn: "Default operational posture is KSA hosting where configured. See Privacy Policy and DPA for processing details.",
    aAr: "الوضع التشغيلي الافتراضي هو الاستضافة في المملكة حيثما تم التكوين. راجع سياسة الخصوصية وملحق المعالجة للتفاصيل.",
  },
  {
    qEn: "What are agent engines?",
    qAr: "ما محركات الوكلاء؟",
    aEn: "Admins assign LLM providers per engine (ingestion, compliance, technical, financial, drafting, rewrite, embedding). Models are fetched live from provider APIs — not hardcoded.",
    aAr: "يعين المسؤولون مزوّدي نماذج لكل محرك (استيعاب، امتثال، فني، مالي، صياغة، إعادة كتابة، تضمين). تُجلب النماذج مباشرة من واجهات المزوّدين — دون قوائم ثابتة.",
  },
  {
    qEn: "Do you submit to Etimad for me?",
    qAr: "هل تقدّمون نيابة عني إلى اعتماد؟",
    aEn: "No. Direct Etimad submission is out of scope. You download packages and submit through official channels.",
    aAr: "لا. التقديم المباشر إلى اعتماد خارج النطاق. تحمّل الحزم وتقدّم عبر القنوات الرسمية.",
  },
  {
    qEn: "How do refunds work?",
    qAr: "كيف يعمل الاسترداد؟",
    aEn: "See Billing & Refunds. Generally non-refundable after quota use in the period, except legal requirements or confirmed payment errors.",
    aAr: "راجع الفوترة والاسترداد. عموماً غير قابل للاسترداد بعد استهلاك الحصة في الفترة، إلا لمتطلبات نظامية أو أخطاء دفع مؤكدة.",
  },
];

export const faqRelated: RelatedLink[] = [
  { href: "/pricing", labelEn: "Packages", labelAr: "الباقات" },
  { href: "/billing-policy", labelEn: "Billing policy", labelAr: "سياسة الفوترة" },
  { href: "/security", labelEn: "Security", labelAr: "الأمن" },
  { href: "/contact", labelEn: "Contact", labelAr: "تواصل" },
];

export const legalHubSections: DocSection[] = [
  {
    titleEn: "Policies",
    titleAr: "السياسات",
    paragraphsEn: [
      "These documents govern use of ArabClue. They are product policies, not a substitute for advice from your counsel.",
    ],
    paragraphsAr: [
      "تنظم هذه الوثائق استخدام أراب كلاو. وهي سياسات منتج وليست بديلاً عن مشورة مستشارك القانوني.",
    ],
  },
];

export const legalHubRelated: RelatedLink[] = [
  { href: "/privacy", labelEn: "Privacy Policy", labelAr: "سياسة الخصوصية" },
  { href: "/terms", labelEn: "Terms of Service", labelAr: "شروط الاستخدام" },
  { href: "/cookies", labelEn: "Cookie Policy", labelAr: "سياسة ملفات الارتباط" },
  { href: "/acceptable-use", labelEn: "Acceptable Use", labelAr: "الاستخدام المقبول" },
  { href: "/billing-policy", labelEn: "Billing & Refunds", labelAr: "الفوترة والاسترداد" },
  { href: "/dpa", labelEn: "Data Processing Addendum", labelAr: "ملحق معالجة البيانات" },
  { href: "/security", labelEn: "Security", labelAr: "الأمن" },
  { href: "/contact", labelEn: "Contact legal", labelAr: "تواصل قانوني" },
];

export const contactChannels = [
  {
    titleEn: "Product support",
    titleAr: "دعم المنتج",
    detailEn: "Workspace access, agents, exports, and billing activation.",
    detailAr: "الوصول لمساحة العمل والوكلاء والتصدير وتفعيل الفوترة.",
    email: "support@arabclue.com",
  },
  {
    titleEn: "Privacy & legal",
    titleAr: "الخصوصية والشؤون القانونية",
    detailEn: "PDPL requests, DPA questions, and policy notices.",
    detailAr: "طلبات حماية البيانات وأسئلة ملحق المعالجة وإشعارات السياسات.",
    email: "legal@arabclue.com",
  },
  {
    titleEn: "Security",
    titleAr: "الأمن",
    detailEn: "Vulnerability reports and security incidents.",
    detailAr: "الإبلاغ عن الثغرات والحوادث الأمنية.",
    email: "security@arabclue.com",
  },
] as const;
