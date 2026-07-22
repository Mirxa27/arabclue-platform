"use client";

import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { MarketingDocPage } from "@/components/marketing/doc-page";
import { usePublicLocale } from "@/components/marketing/public-shell";
import { contactChannels } from "@/lib/marketing/company-content";

function ContactChannels() {
  const locale = usePublicLocale();
  const ar = locale === "ar";

  return (
    <div className="grid gap-8 sm:grid-cols-3 mb-4">
      {contactChannels.map((c, i) => (
        <motion.div
          key={c.email}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className="border-t border-white/15 pt-5"
        >
          <h2 className="text-sm font-semibold text-white">
            {ar ? c.titleAr : c.titleEn}
          </h2>
          <p className="mt-2 text-sm text-white/50 leading-relaxed">
            {ar ? c.detailAr : c.detailEn}
          </p>
          <a
            href={`mailto:${c.email}`}
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[oklch(0.78_0.12_195)] hover:underline"
          >
            <Mail className="size-4" />
            {c.email}
          </a>
        </motion.div>
      ))}
    </div>
  );
}

export default function ContactPage() {
  return (
    <MarketingDocPage
      activePath="/contact"
      titleEn="Contact"
      titleAr="تواصل معنا"
      summaryEn="Support, legal, and security channels for ArabClue customers and partners."
      summaryAr="قنوات الدعم والشؤون القانونية والأمن لعملاء أراب كلاو وشركائها."
      heroAccent="warm"
      related={[
        { href: "/faq", labelEn: "FAQ", labelAr: "الأسئلة الشائعة" },
        { href: "/legal", labelEn: "Legal", labelAr: "الشؤون القانونية" },
        { href: "/pricing", labelEn: "Packages", labelAr: "الباقات" },
      ]}
      sections={[
        {
          titleEn: "Response times",
          titleAr: "أوقات الاستجابة",
          paragraphsEn: [
            "We aim to respond to support and legal emails within two business days. Security reports are prioritized.",
            "Login requires a platform-provisioned account — contact your workspace admin for access, or email support@arabclue.com for enterprise onboarding.",
          ],
          paragraphsAr: [
            "نسعى للرد على بريد الدعم والشؤون القانونية خلال يومي عمل. وتُعطى أولوية لتقارير الأمن.",
            "يتطلب تسجيل الدخول حساباً مُنشأ من المنصة — تواصل مع مسؤول مساحة عملك للوصول، أو راسل support@arabclue.com لتأهيل المؤسسات.",
          ],
        },
      ]}
    >
      <ContactChannels />
    </MarketingDocPage>
  );
}
