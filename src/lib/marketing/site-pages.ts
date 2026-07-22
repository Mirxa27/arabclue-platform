/**
 * Public marketing / legal routes registry.
 * Used by footer, sitemap, and middleware allowlist.
 */

export type PublicPageMeta = {
  path: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  group: "product" | "company" | "legal" | "support";
};

export const PUBLIC_MARKETING_PAGES: PublicPageMeta[] = [
  {
    path: "/",
    titleEn: "Home",
    titleAr: "الرئيسية",
    descriptionEn: "AI bid-preparation SaaS for Saudi Etimad tenders",
    descriptionAr: "منصة إعداد عطاءات اعتماد بالذكاء الاصطناعي",
    group: "product",
  },
  {
    path: "/pricing",
    titleEn: "Packages & Pricing",
    titleAr: "الباقات والأسعار",
    descriptionEn: "Clear packages for tender teams in SAR",
    descriptionAr: "باقات واضحة لفرق المناقصات بالريال",
    group: "product",
  },
  {
    path: "/compliance",
    titleEn: "Compliance",
    titleAr: "الامتثال",
    descriptionEn: "NCA, PDPL, and local-content frameworks",
    descriptionAr: "أطر الهيئة الوطنية وحماية البيانات والمحتوى المحلي",
    group: "product",
  },
  {
    path: "/for-owners",
    titleEn: "For Owners",
    titleAr: "لأصحاب العمل",
    descriptionEn: "Multi-agent proposal operations for bid owners",
    descriptionAr: "تشغيل عطاءات متعدد الوكلاء لأصحاب العمل",
    group: "product",
  },
  {
    path: "/about",
    titleEn: "About",
    titleAr: "عن أراب كلاو",
    descriptionEn: "What ArabClue is — and what it deliberately does not do",
    descriptionAr: "ما هي أراب كلاو — وما لا تفعله عمداً",
    group: "company",
  },
  {
    path: "/contact",
    titleEn: "Contact",
    titleAr: "تواصل معنا",
    descriptionEn: "Reach support, sales, and legal for ArabClue",
    descriptionAr: "تواصل مع الدعم والمبيعات والشؤون القانونية",
    group: "support",
  },
  {
    path: "/faq",
    titleEn: "FAQ",
    titleAr: "الأسئلة الشائعة",
    descriptionEn: "Answers about agents, pricing guardrails, billing, and compliance",
    descriptionAr: "إجابات عن الوكلاء وحواجز التسعير والفوترة والامتثال",
    group: "support",
  },
  {
    path: "/security",
    titleEn: "Security",
    titleAr: "الأمن",
    descriptionEn: "Tenant isolation, MFA, audit trails, and operational posture",
    descriptionAr: "عزل المستأجرين والمصادقة الثنائية وسجلات التدقيق",
    group: "company",
  },
  {
    path: "/legal",
    titleEn: "Legal",
    titleAr: "الشؤون القانونية",
    descriptionEn: "Policies governing use of ArabClue",
    descriptionAr: "السياسات المنظمة لاستخدام أراب كلاو",
    group: "legal",
  },
  {
    path: "/privacy",
    titleEn: "Privacy Policy",
    titleAr: "سياسة الخصوصية",
    descriptionEn: "How ArabClue processes personal data under PDPL",
    descriptionAr: "كيف تعالج أراب كلاو البيانات الشخصية وفق نظام حماية البيانات",
    group: "legal",
  },
  {
    path: "/terms",
    titleEn: "Terms of Service",
    titleAr: "شروط الاستخدام",
    descriptionEn: "Terms governing access to the ArabClue platform",
    descriptionAr: "الشروط المنظمة للوصول إلى منصة أراب كلاو",
    group: "legal",
  },
  {
    path: "/cookies",
    titleEn: "Cookie Policy",
    titleAr: "سياسة ملفات الارتباط",
    descriptionEn: "Cookies and similar technologies used by ArabClue",
    descriptionAr: "ملفات الارتباط والتقنيات المماثلة المستخدمة في أراب كلاو",
    group: "legal",
  },
  {
    path: "/acceptable-use",
    titleEn: "Acceptable Use",
    titleAr: "الاستخدام المقبول",
    descriptionEn: "Prohibited and permitted uses of ArabClue",
    descriptionAr: "الاستخدامات المسموحة والمحظورة لأراب كلاو",
    group: "legal",
  },
  {
    path: "/billing-policy",
    titleEn: "Billing & Refunds",
    titleAr: "الفوترة والاسترداد",
    descriptionEn: "Subscriptions, invoices, and refund rules via MyFatoorah",
    descriptionAr: "الاشتراكات والفواتير وقواعد الاسترداد عبر ماي فاتورة",
    group: "legal",
  },
  {
    path: "/dpa",
    titleEn: "Data Processing Addendum",
    titleAr: "ملحق معالجة البيانات",
    descriptionEn: "Controller–processor terms for customer personal data",
    descriptionAr: "شروط المتحكم والمعالج لبيانات العملاء الشخصية",
    group: "legal",
  },
];

/** Paths that must be reachable without authentication. */
export const PUBLIC_PAGE_PATHS = [
  ...PUBLIC_MARKETING_PAGES.map((p) => p.path),
  "/login",
  "/billing/callback",
] as const;

export function pagesByGroup(group: PublicPageMeta["group"]): PublicPageMeta[] {
  return PUBLIC_MARKETING_PAGES.filter((p) => p.group === group);
}
