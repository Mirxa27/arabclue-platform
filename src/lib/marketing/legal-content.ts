import type { DocSection, FaqItem, RelatedLink } from "@/components/marketing/doc-page";

export const LEGAL_UPDATED = "22 July 2026";

const LEGAL_RELATED: RelatedLink[] = [
  { href: "/legal", labelEn: "Legal hub", labelAr: "الشؤون القانونية" },
  { href: "/privacy", labelEn: "Privacy", labelAr: "الخصوصية" },
  { href: "/terms", labelEn: "Terms", labelAr: "الشروط" },
  { href: "/dpa", labelEn: "DPA", labelAr: "ملحق المعالجة" },
  { href: "/contact", labelEn: "Contact", labelAr: "تواصل" },
];

export const privacyContent = {
  activePath: "/privacy",
  titleEn: "Privacy Policy",
  titleAr: "سياسة الخصوصية",
  summaryEn:
    "How ArabClue processes personal data for Saudi/GCC tender teams — aligned with the Kingdom’s Personal Data Protection Law (PDPL).",
  summaryAr:
    "كيف تعالج أراب كلاو البيانات الشخصية لفرق المناقصات في المملكة والخليج — بما يتوافق مع نظام حماية البيانات الشخصية.",
  updated: LEGAL_UPDATED,
  related: LEGAL_RELATED,
  sections: [
    {
      titleEn: "Who we are",
      titleAr: "من نحن",
      paragraphsEn: [
        "ArabClue (“أراب كلاو”, “we”, “us”) provides an AI-assisted bid-preparation SaaS for government and private-sector tenders, with initial focus on Saudi Etimad-oriented workflows.",
        "For privacy requests: legal@arabclue.com. For product support: support@arabclue.com.",
      ],
      paragraphsAr: [
        "أراب كلاو («نحن») تقدّم منصة SaaS بمساعدة الذكاء الاصطناعي لإعداد العطاءات للمناقصات الحكومية والخاصة، مع تركيز أولي على مسارات اعتماد في المملكة.",
        "لطلبات الخصوصية: legal@arabclue.com. لدعم المنتج: support@arabclue.com.",
      ],
    },
    {
      titleEn: "Data we process",
      titleAr: "البيانات التي نعالجها",
      bulletsEn: [
        "Account data: name, work email, role, locale, MFA settings, and authentication events.",
        "Workspace data: company profile, certificates, staff profiles, methodologies, partnerships, and other knowledge-base assets you upload.",
        "Tender project data: RFP documents, requirements, agent outputs, proposal drafts, reviews, and exports.",
        "Billing data: plan, invoices, payment status, and MyFatoorah transaction references (card details are handled by MyFatoorah).",
        "Technical logs: IP address, user agent, audit events, and operational diagnostics needed to secure the service.",
      ],
      bulletsAr: [
        "بيانات الحساب: الاسم، البريد المهني، الدور، اللغة، إعدادات المصادقة الثنائية، وأحداث الدخول.",
        "بيانات مساحة العمل: ملف الشركة، الشهادات، ملفات الطاقم، المنهجيات، الشراكات، وأصول قاعدة المعرفة التي ترفعها.",
        "بيانات مشاريع المناقصات: مستندات طلب العروض، المتطلبات، مخرجات الوكلاء، مسودات العطاءات، المراجعات، والتصدير.",
        "بيانات الفوترة: الباقة، الفواتير، حالة الدفع، ومراجع معاملات ماي فاتورة (تفاصيل البطاقة لدى ماي فاتورة).",
        "سجلات تقنية: عنوان IP، وكيل المتصفح، أحداث التدقيق، والتشخيصات التشغيلية اللازمة لتأمين الخدمة.",
      ],
    },
    {
      titleEn: "Purposes and legal bases",
      titleAr: "الأغراض والأسس النظامية",
      paragraphsEn: [
        "We process data to provide the workspace, run AI agents you initiate, enforce quotas, bill subscriptions, secure accounts, and maintain immutable audit trails for regulated environments.",
        "Processing is based on contract performance, legitimate interests in securing multi-tenant SaaS, and — where required — consent (for example optional marketing cookies if enabled).",
      ],
      paragraphsAr: [
        "نعالج البيانات لتقديم مساحة العمل، وتشغيل وكلاء الذكاء الاصطناعي التي تبدأها، وفرض الحصص، وفوترة الاشتراكات، وتأمين الحسابات، والحفاظ على سجلات تدقيق غير قابلة للتغيير للبيئات الخاضعة للتنظيم.",
        "تستند المعالجة إلى تنفيذ العقد، والمصلحة المشروعة في تأمين خدمة متعددة المستأجرين، وعند الاقتضاء الموافقة (مثل ملفات ارتباط تسويقية اختيارية إن وُجدت).",
      ],
    },
    {
      titleEn: "Hosting and transfers",
      titleAr: "الاستضافة والنقل",
      paragraphsEn: [
        "Platform default hosting posture is Kingdom of Saudi Arabia where configured. That is an operational posture, not a universal legal conclusion for every customer workload.",
        "If a subprocessors arrangement requires a cross-border transfer, we evaluate PDPL transfer rules, contractual restrictions, and customer policy. Customers remain responsible for lawful tender content they upload.",
      ],
      paragraphsAr: [
        "الوضع التشغيلي الافتراضي للاستضافة هو المملكة العربية السعودية حيثما تم التكوين. هذا وضع تشغيلي وليس استنتاجاً نظامياً شاملاً لكل أحمال العملاء.",
        "إذا تطلب ترتيب معالج فرعي نقلاً عبر الحدود، نقيّم قواعد النقل في نظام حماية البيانات والقيود التعاقدية وسياسة العميل. يبقى العميل مسؤولاً عن مشروعية محتوى المناقصات الذي يرفعه.",
      ],
    },
    {
      titleEn: "Your rights",
      titleAr: "حقوقك",
      paragraphsEn: [
        "Subject to PDPL and applicable exceptions, individuals may request access, correction, deletion, or restriction of personal data, and may lodge a complaint with the competent authority.",
        "Workspace admins control membership and content inside their tenant. Contact legal@arabclue.com for privacy requests; we respond within a reasonable period.",
      ],
      paragraphsAr: [
        "مع مراعاة نظام حماية البيانات الشخصية والاستثناءات المعمول بها، يجوز للأفراد طلب الاطلاع أو التصحيح أو الحذف أو تقييد المعالجة، ويجوز تقديم شكوى للجهة المختصة.",
        "يتحكم مسؤولو مساحة العمل في العضوية والمحتوى داخل مستأجرهم. راسل legal@arabclue.com لطلبات الخصوصية؛ نرد خلال مدة معقولة.",
      ],
    },
    {
      titleEn: "Retention",
      titleAr: "الاحتفاظ",
      paragraphsEn: [
        "We retain account and project data while the workspace is active and for a limited period afterward for backups, dispute resolution, and legal obligations. Audit logs may be retained longer for security and compliance evidence.",
      ],
      paragraphsAr: [
        "نحتفظ ببيانات الحساب والمشاريع أثناء نشاط مساحة العمل ولفترة محدودة بعدها للنسخ الاحتياطي وحل النزاعات والالتزامات النظامية. قد تُحفظ سجلات التدقيق لفترة أطول لأدلة الأمن والامتثال.",
      ],
    },
    {
      titleEn: "Not legal advice",
      titleAr: "ليست استشارة قانونية",
      paragraphsEn: [
        "Compliance matrices and regulatory commentary generated in the product are assisted drafting aids, not legal advice. Authorized human legal review is required before submission.",
      ],
      paragraphsAr: [
        "مصفوفات الامتثال والتعليقات التنظيمية المولَّدة في المنتج أدوات صياغة مساعدة، وليست استشارة قانونية. يلزم مراجعة قانونية بشرية معتمدة قبل التقديم.",
      ],
    },
  ] satisfies DocSection[],
};

export const termsContent = {
  activePath: "/terms",
  titleEn: "Terms of Service",
  titleAr: "شروط الاستخدام",
  summaryEn:
    "Rules for accessing ArabClue workspaces, AI agents, exports, and billing.",
  summaryAr:
    "قواعد الوصول إلى مساحات عمل أراب كلاو ووكلاء الذكاء الاصطناعي والتصدير والفوترة.",
  updated: LEGAL_UPDATED,
  related: LEGAL_RELATED,
  sections: [
    {
      titleEn: "Agreement",
      titleAr: "الاتفاق",
      paragraphsEn: [
        "By creating or using an ArabClue account you agree to these Terms, the Privacy Policy, Acceptable Use Policy, and Billing Policy. If you use ArabClue on behalf of an organization, you represent that you have authority to bind that organization.",
      ],
      paragraphsAr: [
        "بإنشاء حساب أراب كلاو أو استخدامه فإنك توافق على هذه الشروط وسياسة الخصوصية وسياسة الاستخدام المقبول وسياسة الفوترة. إذا استخدمت أراب كلاو نيابة عن جهة، فأنت تقر بأن لديك صلاحية إلزام تلك الجهة.",
      ],
    },
    {
      titleEn: "The service",
      titleAr: "الخدمة",
      paragraphsEn: [
        "ArabClue helps tender teams ingest RFPs, draft technical content from an account knowledge base, structure financial forms, and produce export packages. Humans remain the final authors of proposals.",
        "The platform deliberately does not price bids. AI must not invent unit prices, margins, or commercial strategy. Humans enter commercial amounts.",
      ],
      paragraphsAr: [
        "تساعد أراب كلاو فرق المناقصات على استيعاب طلبات العروض، وصياغة المحتوى الفني من قاعدة معرفة الحساب، وهيكلة النماذج المالية، وإنتاج حزم التصدير. يبقى البشر المؤلفين النهائيين للعطاءات.",
        "لا تسعّر المنصة العطاءات عمداً. يجب ألا يخترع الذكاء الاصطناعي أسعار الوحدات أو الهوامش أو الاستراتيجية التجارية. يدخل البشر المبالغ التجارية.",
      ],
    },
    {
      titleEn: "Accounts and access",
      titleAr: "الحسابات والوصول",
      bulletsEn: [
        "Access is provisioned by platform or workspace administrators.",
        "You must keep credentials confidential and enable MFA where available for privileged roles.",
        "We may suspend accounts that present security risk, unpaid invoices, or Acceptable Use violations.",
      ],
      bulletsAr: [
        "يُمنح الوصول من مسؤولي المنصة أو مساحة العمل.",
        "يجب الحفاظ على سرية بيانات الدخول وتفعيل المصادقة الثنائية حيثما أتيحت للأدوار الحساسة.",
        "يجوز تعليق الحسابات التي تشكّل خطراً أمنياً أو عليها فواتير غير مسددة أو تخالف الاستخدام المقبول.",
      ],
    },
    {
      titleEn: "Customer content",
      titleAr: "محتوى العميل",
      paragraphsEn: [
        "You retain ownership of documents and data you upload. You grant ArabClue a limited license to process that content solely to provide the service (including AI inference, storage, export, and audit logging).",
        "You represent that you have rights to upload tender documents and personal data of staff or partners included in your knowledge base.",
      ],
      paragraphsAr: [
        "تحتفظ بملكية المستندات والبيانات التي ترفعها. وتمنح أراب كلاو ترخيصاً محدوداً لمعالجة ذلك المحتوى فقط لتقديم الخدمة (بما في ذلك استدلال الذكاء الاصطناعي والتخزين والتصدير وسجلات التدقيق).",
        "تقر بأن لديك حقوق رفع مستندات المناقصات والبيانات الشخصية للطاقم أو الشركاء المدرجين في قاعدة معرفتك.",
      ],
    },
    {
      titleEn: "AI outputs and disclaimers",
      titleAr: "مخرجات الذكاء الاصطناعي وإخلاء المسؤولية",
      paragraphsEn: [
        "Agent outputs may contain errors, incomplete citations, or outdated regulatory references. Compliance content is not legal advice. You must review, edit, and approve all materials before submission to any procuring entity.",
        "ArabClue is not a law firm, not an Etimad submission portal, and not a substitute for licensed professional advice.",
      ],
      paragraphsAr: [
        "قد تحتوي مخرجات الوكلاء على أخطاء أو استشهادات غير مكتملة أو مراجع تنظيمية قديمة. محتوى الامتثال ليس استشارة قانونية. يجب مراجعة وتحرير واعتماد كل المواد قبل التقديم لأي جهة طارحة.",
        "أراب كلاو ليست مكتباً قانونياً، وليست بوابة تقديم لاعتماد، وليست بديلاً عن المشورة المهنية المرخصة.",
      ],
    },
    {
      titleEn: "Availability and changes",
      titleAr: "التوفر والتغييرات",
      paragraphsEn: [
        "We aim for high availability but do not guarantee uninterrupted service. Features, models, and quotas may change with notice where material.",
        "We may update these Terms; continued use after the stated update date constitutes acceptance of material changes notified in-product or by email.",
      ],
      paragraphsAr: [
        "نسعى لتوفر عالٍ دون ضمان خدمة بلا انقطاع. قد تتغير الميزات والنماذج والحصص مع إشعار عند الأثر الجوهري.",
        "يجوز تحديث هذه الشروط؛ ويُعد الاستمرار في الاستخدام بعد تاريخ التحديث قبولاً للتغييرات الجوهرية المُبلَّغ عنها داخل المنتج أو بالبريد.",
      ],
    },
    {
      titleEn: "Liability",
      titleAr: "المسؤولية",
      paragraphsEn: [
        "To the maximum extent permitted by applicable law, ArabClue is not liable for lost profits, lost bids, procurement decisions, or indirect damages arising from use of AI drafts or downtime.",
        "Aggregate liability for paid subscriptions is limited to fees paid for the three months preceding the claim, except where liability cannot be limited by law.",
      ],
      paragraphsAr: [
        "إلى أقصى حد يسمح به النظام المعمول به، لا تتحمل أراب كلاو المسؤولية عن فوات الأرباح أو فقدان العطاءات أو قرارات الترسية أو الأضرار غير المباشرة الناشئة عن مسودات الذكاء الاصطناعي أو التوقف.",
        "تقتصر المسؤولية الإجمالية للاشتراكات المدفوعة على الرسوم المدفوعة عن الأشهر الثلاثة السابقة للمطالبة، باستثناء ما لا يجوز تقييده نظاماً.",
      ],
    },
    {
      titleEn: "Governing law",
      titleAr: "القانون الحاكم",
      paragraphsEn: [
        "These Terms are governed by the laws of the Kingdom of Saudi Arabia. Courts of competent jurisdiction in the Kingdom shall have exclusive venue, unless mandatory consumer protections require otherwise.",
      ],
      paragraphsAr: [
        "تخضع هذه الشروط لأنظمة المملكة العربية السعودية. وتكون محاكم المملكة ذات الاختصاص الحصري، ما لم تقتضِ حماية المستهلك الإلزامية خلاف ذلك.",
      ],
    },
  ] satisfies DocSection[],
};

export const cookiesContent = {
  activePath: "/cookies",
  titleEn: "Cookie Policy",
  titleAr: "سياسة ملفات الارتباط",
  summaryEn:
    "Cookies and similar technologies ArabClue uses to run sessions, remember preferences, and secure the product.",
  summaryAr:
    "ملفات الارتباط والتقنيات المماثلة التي تستخدمها أراب كلاو لتشغيل الجلسات وتذكر التفضيلات وتأمين المنتج.",
  updated: LEGAL_UPDATED,
  related: LEGAL_RELATED,
  sections: [
    {
      titleEn: "What we use",
      titleAr: "ما نستخدمه",
      bulletsEn: [
        "Essential session cookies for authentication (NextAuth / JWT session).",
        "Preference storage (locale and theme) in localStorage on marketing pages.",
        "Security and abuse-prevention signals on login and payment callbacks.",
      ],
      bulletsAr: [
        "ملفات ارتباط أساسية للجلسة (مصادقة NextAuth / جلسة JWT).",
        "تخزين التفضيلات (اللغة والسمة) في localStorage على صفحات التسويق.",
        "إشارات أمن ومنع إساءة الاستخدام عند تسجيل الدخول واستدعاءات الدفع.",
      ],
    },
    {
      titleEn: "Marketing analytics",
      titleAr: "تحليلات التسويق",
      paragraphsEn: [
        "We do not load third-party advertising cookies on the core product by default. If optional analytics are enabled in a future release, we will update this policy and provide controls where required.",
      ],
      paragraphsAr: [
        "لا نحمّل ملفات ارتباط إعلانية من طرف ثالث على المنتج الأساسي افتراضياً. إذا فُعِّلت تحليلات اختيارية لاحقاً، سنحدّث هذه السياسة ونوفّر ضوابط حيث يلزم.",
      ],
    },
    {
      titleEn: "Managing cookies",
      titleAr: "إدارة ملفات الارتباط",
      paragraphsEn: [
        "You can clear cookies and site data in your browser. Disabling essential cookies will prevent sign-in and workspace use.",
      ],
      paragraphsAr: [
        "يمكنك مسح ملفات الارتباط وبيانات الموقع من المتصفح. تعطيل الملفات الأساسية يمنع تسجيل الدخول واستخدام مساحة العمل.",
      ],
    },
  ] satisfies DocSection[],
};

export const aupContent = {
  activePath: "/acceptable-use",
  titleEn: "Acceptable Use Policy",
  titleAr: "سياسة الاستخدام المقبول",
  summaryEn:
    "What you may and may not do when using ArabClue agents, uploads, and exports.",
  summaryAr:
    "ما يجوز وما لا يجوز عند استخدام وكلاء أراب كلاو والرفع والتصدير.",
  updated: LEGAL_UPDATED,
  related: LEGAL_RELATED,
  sections: [
    {
      titleEn: "Permitted use",
      titleAr: "الاستخدام المسموح",
      bulletsEn: [
        "Preparing bids for tenders your organization is authorized to pursue.",
        "Storing account knowledge (certificates, staff, methodologies) for reuse.",
        "Human review, editing, approval, and export of proposal packages.",
      ],
      bulletsAr: [
        "إعداد عطاءات لمناقصات يحق لمؤسستك التقدم لها.",
        "تخزين معرفة الحساب (شهادات، طاقم، منهجيات) لإعادة الاستخدام.",
        "المراجعة البشرية والتحرير والاعتماد وتصدير حزم العطاء.",
      ],
    },
    {
      titleEn: "Prohibited use",
      titleAr: "الاستخدام المحظور",
      bulletsEn: [
        "Attempting to bypass pricing guardrails to obtain AI-generated bid prices or margins.",
        "Uploading malware, credential dumps, or content you do not have rights to process.",
        "Probing other tenants, scraping, or abusing APIs beyond documented quotas.",
        "Using the service to generate unlawful, fraudulent, or defamatory content.",
        "Reselling access without a written enterprise agreement.",
      ],
      bulletsAr: [
        "محاولة تجاوز حواجز التسعير للحصول على أسعار أو هوامش عطاء مولَّدة بالذكاء الاصطناعي.",
        "رفع برمجيات خبيثة أو تسريبات بيانات دخول أو محتوى لا تملك حق معالجته.",
        "استكشاف مستأجرين آخرين أو الكشط أو إساءة استخدام واجهات البرمجة بما يتجاوز الحصص.",
        "استخدام الخدمة لتوليد محتوى غير مشروع أو احتيالي أو تشهيري.",
        "إعادة بيع الوصول دون اتفاقية مؤسسات مكتوبة.",
      ],
    },
    {
      titleEn: "Enforcement",
      titleAr: "الإنفاذ",
      paragraphsEn: [
        "We may investigate violations, remove content, suspend access, and report unlawful activity to competent authorities when required.",
      ],
      paragraphsAr: [
        "يجوز التحقيق في المخالفات وإزالة المحتوى وتعليق الوصول والإبلاغ عن النشاط غير المشروع للجهات المختصة عند الاقتضاء.",
      ],
    },
  ] satisfies DocSection[],
};

export const billingContent = {
  activePath: "/billing-policy",
  titleEn: "Billing & Refunds",
  titleAr: "الفوترة والاسترداد",
  summaryEn:
    "How packages, invoices, MyFatoorah payments, and refunds work.",
  summaryAr:
    "كيف تعمل الباقات والفواتير ومدفوعات ماي فاتورة والاسترداد.",
  updated: LEGAL_UPDATED,
  related: [
    ...LEGAL_RELATED,
    { href: "/pricing", labelEn: "Packages", labelAr: "الباقات" },
    { href: "/faq", labelEn: "FAQ", labelAr: "الأسئلة الشائعة" },
  ],
  sections: [
    {
      titleEn: "Plans and quotas",
      titleAr: "الباقات والحصص",
      paragraphsEn: [
        "Published packages (Starter, Professional, Enterprise) include seat, project, document, and agent-run quotas enforced at upload and agent start.",
        "Enterprise may include custom limits agreed in writing.",
      ],
      paragraphsAr: [
        "تشمل الباقات المنشورة (المبتدئ، الاحترافي، المؤسسات) حصص مقاعد ومشاريع ومستندات وتشغيل وكلاء تُفرض عند الرفع وبدء الوكيل.",
        "قد تتضمن باقة المؤسسات حدوداً مخصصة باتفاق مكتوب.",
      ],
    },
    {
      titleEn: "Payment processor",
      titleAr: "معالج الدفع",
      paragraphsEn: [
        "Subscriptions and invoices are processed through MyFatoorah. ArabClue does not store full card numbers. Payment statuses and webhook events are reconciled for entitlement activation.",
      ],
      paragraphsAr: [
        "تُعالج الاشتراكات والفواتير عبر ماي فاتورة. لا تخزّن أراب كلاو أرقام البطاقات كاملة. وتُسوّى حالات الدفع وأحداث الويب هوك لتفعيل الاستحقاق.",
      ],
    },
    {
      titleEn: "Renewals and cancellation",
      titleAr: "التجديد والإلغاء",
      paragraphsEn: [
        "Plans renew according to the selected billing cycle until canceled from the workspace billing settings or by written request to support@arabclue.com.",
        "Cancellation stops future renewals; access continues through the paid period already settled.",
      ],
      paragraphsAr: [
        "تتجدد الباقات وفق دورة الفوترة المختارة حتى الإلغاء من إعدادات الفوترة داخل مساحة العمل أو بطلب كتابي إلى support@arabclue.com.",
        "يوقف الإلغاء التجديدات المستقبلية؛ ويستمر الوصول حتى نهاية الفترة المدفوعة.",
      ],
    },
    {
      titleEn: "Refunds",
      titleAr: "الاسترداد",
      paragraphsEn: [
        "Fees are generally non-refundable once an agent run or document processing has consumed quota in the billing period, except where required by applicable law or where a confirmed payment error / double charge occurred.",
        "Refund requests must be submitted within 14 days of the charge to support@arabclue.com with the invoice or payment reference.",
      ],
      paragraphsAr: [
        "الرسوم عموماً غير قابلة للاسترداد بعد استهلاك حصة تشغيل وكيل أو معالجة مستند في فترة الفوترة، إلا حيث يقتضي النظام ذلك أو عند خطأ دفع مؤكد / خصم مزدوج.",
        "تُقدَّم طلبات الاسترداد خلال 14 يوماً من الخصم إلى support@arabclue.com مع رقم الفاتورة أو مرجع الدفع.",
      ],
    },
    {
      titleEn: "Taxes",
      titleAr: "الضرائب",
      paragraphsEn: [
        "Prices may be shown exclusive or inclusive of VAT depending on invoice configuration. Customers are responsible for providing accurate billing entity details.",
      ],
      paragraphsAr: [
        "قد تُعرض الأسعار شاملة أو غير شاملة لضريبة القيمة المضافة حسب إعداد الفاتورة. يتحمل العميل مسؤولية تقديم بيانات جهة الفوترة بدقة.",
      ],
    },
  ] satisfies DocSection[],
};

export const dpaContent = {
  activePath: "/dpa",
  titleEn: "Data Processing Addendum",
  titleAr: "ملحق معالجة البيانات",
  summaryEn:
    "Controller–processor terms when ArabClue processes personal data on behalf of a customer workspace.",
  summaryAr:
    "شروط المتحكم والمعالج حين تعالج أراب كلاو بيانات شخصية نيابة عن مساحة عمل العميل.",
  updated: LEGAL_UPDATED,
  related: LEGAL_RELATED,
  sections: [
    {
      titleEn: "Roles",
      titleAr: "الأدوار",
      paragraphsEn: [
        "The customer organization is the controller (or independent controller) of personal data in its workspace. ArabClue acts as a processor for that customer personal data when providing the SaaS.",
        "For ArabClue’s own account, billing, and security logs, ArabClue may act as an independent controller as described in the Privacy Policy.",
      ],
      paragraphsAr: [
        "مؤسسة العميل هي المتحكم (أو متحكم مستقل) في البيانات الشخصية داخل مساحتها. وتعمل أراب كلاو كمعالج لتلك البيانات عند تقديم الخدمة.",
        "بالنسبة لحساب أراب كلاو وفوترتها وسجلات أمنها، قد تعمل أراب كلاو كمتحكم مستقل وفق سياسة الخصوصية.",
      ],
    },
    {
      titleEn: "Instructions",
      titleAr: "التعليمات",
      paragraphsEn: [
        "ArabClue processes customer personal data only on documented instructions: to host the workspace, run user-initiated agents, export packages, and maintain security and audit controls.",
        "ArabClue will not use customer tender content to train public foundation models unless a separate written agreement expressly authorizes it.",
      ],
      paragraphsAr: [
        "تعالج أراب كلاو بيانات العميل الشخصية فقط وفق تعليمات موثّقة: لاستضافة مساحة العمل، وتشغيل الوكلاء بمبادرة المستخدم، وتصدير الحزم، والحفاظ على ضوابط الأمن والتدقيق.",
        "لن تستخدم أراب كلاو محتوى مناقصات العميل لتدريب نماذج عامة إلا باتفاق مكتوب منفصل يصرّح بذلك صراحة.",
      ],
    },
    {
      titleEn: "Security measures",
      titleAr: "تدابير الأمن",
      bulletsEn: [
        "Tenant-scoped data access and role-based authorization.",
        "Encryption in transit (TLS) and encryption of secrets at rest where configured.",
        "Optional MFA, session controls, and admin audit logs.",
        "Safe archive extraction limits for uploaded ZIP packages.",
      ],
      bulletsAr: [
        "وصول بيانات حسب المستأجر وتفويض قائم على الأدوار.",
        "تشفير أثناء النقل (TLS) وتشفير الأسرار في التخزين حيثما تم التكوين.",
        "مصادقة ثنائية اختيارية وضوابط جلسة وسجلات تدقيق للمسؤول.",
        "حدود استخراج آمنة لأرشيفات ZIP المرفوعة.",
      ],
    },
    {
      titleEn: "Subprocessors",
      titleAr: "المعالجون الفرعيون",
      paragraphsEn: [
        "Infrastructure, database, object storage, payment (MyFatoorah), and AI model providers may process data as subprocessors. Customers may request a current subprocessor list via legal@arabclue.com.",
      ],
      paragraphsAr: [
        "قد تعالج البنية التحتية وقاعدة البيانات وتخزين الكائنات والمدفوعات (ماي فاتورة) ومزوّدو نماذج الذكاء الاصطناعي البيانات كمعالجين فرعيين. يمكن طلب قائمة حديثة عبر legal@arabclue.com.",
      ],
    },
    {
      titleEn: "Breach notification",
      titleAr: "الإخطار بالحادث",
      paragraphsEn: [
        "ArabClue will notify the customer without undue delay after becoming aware of a personal data breach affecting the customer workspace, with information reasonably available to assist the customer’s own notification duties.",
      ],
      paragraphsAr: [
        "تخطر أراب كلاو العميل دون تأخير غير مبرر بعد العلم بحادث بيانات شخصية يؤثر على مساحة عمله، مع المعلومات المتوفرة بشكل معقول لمساعدته في واجبات الإخطار.",
      ],
    },
    {
      titleEn: "Return and deletion",
      titleAr: "الإرجاع والحذف",
      paragraphsEn: [
        "Upon termination, customers may export available proposals and documents. After a retention window for backups and legal holds, ArabClue deletes or anonymizes customer personal data from active systems, except where retention is required by law.",
      ],
      paragraphsAr: [
        "عند الإنهاء، يمكن للعملاء تصدير العطاءات والمستندات المتاحة. وبعد نافذة احتفاظ للنسخ الاحتياطي والحجوزات النظامية، تحذف أراب كلاو بيانات العميل الشخصية أو تُعمّيها من الأنظمة النشطة، إلا حيث يلزم الاحتفاظ نظاماً.",
      ],
    },
  ] satisfies DocSection[],
};
