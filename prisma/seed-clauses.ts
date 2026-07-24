/**
 * Seed standard contract clauses for the Contract Template System
 * 
 * Run with: bun run tsx prisma/seed-clauses.ts
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const STANDARD_CLAUSES = [
  // Payment Terms (3 clauses)
  {
    id: "clause-payment-milestone",
    category: "payment",
    nameEn: "Milestone-Based Payment",
    nameAr: "الدفع على أساس المعالم",
    contentEn: "Payment shall be made upon completion and acceptance of each milestone as specified in the Payment Schedule. Each invoice must be accompanied by evidence of milestone completion.",
    contentAr: "يتم الدفع عند إتمام وقبول كل معلم وفقاً لما هو محدد في جدول الدفع. يجب أن ترفق كل فاتورة بأدلة على إتمام المعلم.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Saudi Commercial Law",
    order: 1,
  },
  {
    id: "clause-payment-net30",
    category: "payment",
    nameEn: "Net 30 Payment Terms",
    nameAr: "شروط الدفع خلال 30 يوماً",
    contentEn: "Payment is due within 30 calendar days from the date of a valid invoice. Late payments shall accrue interest at the rate specified by SAMA.",
    contentAr: "يستحق الدفع خلال 30 يوماً تقويمياً من تاريخ الفاتورة الصحيحة. تستحق فائدة على المدفوعات المتأخرة بالمعدل الذي تحدده مؤسسة النقد.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Saudi Arabian Monetary Authority (SAMA) regulations",
    order: 2,
  },
  {
    id: "clause-payment-advance",
    category: "payment",
    nameEn: "Advance Payment",
    nameAr: "الدفعة المقدمة",
    contentEn: "An advance payment of [percentage]% shall be paid upon contract signing, secured by an unconditional bank guarantee valid for the contract period.",
    contentAr: "تُدفع دفعة مقدمة بنسبة [percentage]% عند توقيع العقد، مضمونة بكفالة بنكية غير مشروطة صالحة لمدة العقد.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Government Tenders and Procurement Law",
    order: 3,
  },
  {
    id: "clause-payment-retention",
    category: "payment",
    nameEn: "Payment Retention",
    nameAr: "المبلغ المحتجز",
    contentEn: "A retention amount of [percentage]% shall be withheld from each payment and released upon final acceptance and completion of the warranty period.",
    contentAr: "يحتجز مبلغ بنسبة [percentage]% من كل دفعة ويُفرج عنه عند القبول النهائي وإتمام فترة الضمان.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Standard Contract Terms",
    order: 4,
  },

  // Delivery Terms (3 clauses)
  {
    id: "clause-delivery-location",
    category: "delivery",
    nameEn: "Delivery Location and Transfer",
    nameAr: "مكان التسليم والنقل",
    contentEn: "Delivery shall be made to [location] in accordance with Incoterms 2020. Risk and title transfer upon acceptance at the delivery location.",
    contentAr: "يتم التسليم في [location] وفقاً لشروط التجارة الدولية 2020. تنتقل المخاطر والملكية عند القبول في مكان التسليم.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Saudi Commercial Law",
    order: 5,
  },
  {
    id: "clause-delivery-inspection",
    category: "delivery",
    nameEn: "Inspection and Acceptance",
    nameAr: "الفحص والقبول",
    contentEn: "The Buyer shall have [days] days to inspect deliverables. Non-conforming items must be reported in writing within this period, otherwise acceptance is deemed complete.",
    contentAr: "يكون للمشتري [days] يوماً لفحص المسلمات. يجب الإبلاغ كتابياً عن البنود غير المطابقة خلال هذه الفترة، وإلا يعتبر القبول مكتملاً.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Saudi Commercial Law - Sale of Goods",
    order: 6,
  },
  {
    id: "clause-delivery-schedule",
    category: "delivery",
    nameEn: "Delivery Schedule and Delays",
    nameAr: "جدول التسليم والتأخيرات",
    contentEn: "Delivery dates are as specified in Annex []. Delays caused by Force Majeure or Buyer actions shall extend the delivery period accordingly.",
    contentAr: "مواعيد التسليم كما هو محدد في الملحق []. التأخيرات الناتجة عن القوة القاهرة أو تصرفات المشتري تمدد فترة التسليم وفقاً لذلك.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Contract Law - Performance Obligations",
    order: 7,
  },

  // Termination (4 clauses)
  {
    id: "clause-termination-convenience",
    category: "termination",
    nameEn: "Termination for Convenience",
    nameAr: "الإنهاء للمصلحة",
    contentEn: "Either Party may terminate this Agreement with [days] days written notice. The Supplier shall be compensated for work completed up to the termination date.",
    contentAr: "يجوز لأي من الطرفين إنهاء هذه الاتفاقية بإشعار كتابي قبل [days] يوماً. يُعوض المورد عن الأعمال المنجزة حتى تاريخ الإنهاء.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Saudi Contract Law - Article 107",
    order: 8,
  },
  {
    id: "clause-termination-cause",
    category: "termination",
    nameEn: "Termination for Cause",
    nameAr: "الإنهاء لسبب مبرر",
    contentEn: "Either Party may terminate immediately upon material breach by the other Party, provided [days] days written notice and opportunity to cure, except for breaches that cannot be cured.",
    contentAr: "يجوز لأي طرف الإنهاء الفوري عند إخلال جوهري من الطرف الآخر، شريطة إشعار كتابي قبل [days] يوماً وفرصة للعلاج، باستثناء الإخلالات التي لا يمكن علاجها.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Saudi Contract Law - Articles 117-123",
    order: 9,
  },
  {
    id: "clause-termination-insolvency",
    category: "termination",
    nameEn: "Termination for Insolvency",
    nameAr: "الإنهاء للإعسار",
    contentEn: "Either Party may terminate immediately if the other Party becomes insolvent, bankrupt, or subject to similar proceedings under Saudi Bankruptcy Law.",
    contentAr: "يجوز لأي طرف الإنهاء الفوري إذا أصبح الطرف الآخر معسراً أو مفلساً أو خاضعاً لإجراءات مماثلة بموجب نظام الإفلاس السعودي.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Saudi Bankruptcy Law 1439H",
    order: 10,
  },
  {
    id: "clause-termination-survival",
    category: "termination",
    nameEn: "Survival of Terms",
    nameAr: "استمرار البنود",
    contentEn: "Provisions relating to confidentiality, intellectual property, liability limitations, dispute resolution, and payment obligations shall survive termination.",
    contentAr: "تستمر الأحكام المتعلقة بالسرية والملكية الفكرية وحدود المسؤولية وتسوية النزاعات والتزامات الدفع بعد الإنهاء.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "General Contract Principles",
    order: 11,
  },

  // Liability (4 clauses)
  {
    id: "clause-liability-cap",
    category: "liability",
    nameEn: "Limitation of Liability",
    nameAr: "حد المسؤولية",
    contentEn: "Except for gross negligence or willful misconduct, each Party's liability shall be limited to [amount/percentage] of the total contract value.",
    contentAr: "باستثناء الإهمال الجسيم أو سوء السلوك المتعمد، تقتصر مسؤولية كل طرف على [amount/percentage] من القيمة الإجمالية للعقد.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Saudi Civil Transactions Law - Tort Liability",
    order: 12,
  },
  {
    id: "clause-liability-indirect",
    category: "liability",
    nameEn: "Exclusion of Consequential Damages",
    nameAr: "استبعاد الأضرار التبعية",
    contentEn: "Neither Party shall be liable for indirect, incidental, consequential, or punitive damages, including lost profits, even if advised of their possibility.",
    contentAr: "لا يكون أي طرف مسؤولاً عن الأضرار غير المباشرة أو العرضية أو التبعية أو العقابية، بما في ذلك الأرباح الضائعة، حتى لو تم إبلاغه بإمكانية حدوثها.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Contractual Damages Principles",
    order: 13,
  },
  {
    id: "clause-liability-warranty",
    category: "liability",
    nameEn: "Warranty and Remedy",
    nameAr: "الضمان والعلاج",
    contentEn: "Supplier warrants that deliverables shall conform to specifications for [period]. The exclusive remedy for breach of warranty is repair, replacement, or refund at Supplier's option.",
    contentAr: "يضمن المورد أن المسلمات تطابق المواصفات لمدة [period]. والعلاج الحصري لخرق الضمان هو الإصلاح أو الاستبدال أو الاسترداد حسب خيار المورد.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Consumer Protection Law - Warranty Provisions",
    order: 14,
  },
  {
    id: "clause-liability-indemnity",
    category: "liability",
    nameEn: "Indemnification",
    nameAr: "التعويض",
    contentEn: "Each Party shall indemnify the other against third-party claims arising from its negligence, breach, or infringement of intellectual property rights.",
    contentAr: "يعوض كل طرف الطرف الآخر ضد مطالبات الأطراف الثالثة الناشئة عن إهماله أو إخلاله أو انتهاكه لحقوق الملكية الفكرية.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Civil Transactions Law - Indemnity",
    order: 15,
  },

  // Dispute Resolution (4 clauses)
  {
    id: "clause-dispute-negotiation",
    category: "dispute-resolution",
    nameEn: "Negotiation and Escalation",
    nameAr: "التفاوض والتصعيد",
    contentEn: "Disputes shall first be escalated to senior management for good-faith negotiation for [days] days before pursuing other remedies.",
    contentAr: "تُصعّد النزاعات أولاً إلى الإدارة العليا للتفاوض بحسن نية لمدة [days] يوماً قبل اللجوء إلى سبل الانتصاف الأخرى.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Alternative Dispute Resolution Principles",
    order: 16,
  },
  {
    id: "clause-dispute-arbitration-scc",
    category: "dispute-resolution",
    nameEn: "Arbitration - Saudi Center for Commercial Arbitration",
    nameAr: "التحكيم - المركز السعودي للتحكيم التجاري",
    contentEn: "Disputes shall be finally resolved by arbitration under the SCCA Rules. The place of arbitration shall be Riyadh, Saudi Arabia. The language shall be Arabic.",
    contentAr: "تُحل النزاعات نهائياً بالتحكيم وفقاً لقواعد المركز السعودي للتحكيم التجاري. مكان التحكيم هو الرياض، المملكة العربية السعودية. واللغة هي العربية.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Saudi Arbitration Law 1433H",
    order: 17,
  },
  {
    id: "clause-dispute-saudi-courts",
    category: "dispute-resolution",
    nameEn: "Jurisdiction - Saudi Courts",
    nameAr: "الاختصاص - المحاكم السعودية",
    contentEn: "The courts of [city], Kingdom of Saudi Arabia, shall have exclusive jurisdiction over any disputes arising from this Agreement.",
    contentAr: "تختص محاكم [city]، المملكة العربية السعودية، حصرياً بالنظر في أي نزاعات تنشأ عن هذه الاتفاقية.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Law of Judiciary",
    order: 18,
  },
  {
    id: "clause-dispute-governing-law",
    category: "dispute-resolution",
    nameEn: "Governing Law",
    nameAr: "القانون الحاكم",
    contentEn: "This Agreement shall be governed by and construed in accordance with the laws of the Kingdom of Saudi Arabia, without regard to conflict of law principles.",
    contentAr: "تخضع هذه الاتفاقية وتُفسر وفقاً لأنظمة المملكة العربية السعودية، دون مراعاة لمبادئ تنازع القوانين.",
    mandatory: true,
    customizable: false,
    saudiLawReference: "Saudi Legal System",
    order: 19,
  },

  // Confidentiality (3 clauses)
  {
    id: "clause-conf-definition",
    category: "confidentiality",
    nameEn: "Confidential Information Definition",
    nameAr: "تعريف المعلومات السرية",
    contentEn: "Confidential Information means all non-public information disclosed by one Party to the other, whether oral, written, or electronic, marked as confidential or reasonably understood to be confidential.",
    contentAr: "تعني المعلومات السرية جميع المعلومات غير العامة التي يفصح عنها أحد الطرفين للآخر، سواء شفهياً أو كتابياً أو إلكترونياً، والمحددة كسرية أو يُفهم بشكل معقول أنها سرية.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Trade Secrets Protection Law",
    order: 20,
  },
  {
    id: "clause-conf-obligations",
    category: "confidentiality",
    nameEn: "Confidentiality Obligations",
    nameAr: "التزامات السرية",
    contentEn: "Each Party shall: (a) protect Confidential Information with the same care as its own confidential information; (b) use it only for the purposes of this Agreement; (c) disclose it only to employees/contractors with need-to-know.",
    contentAr: "يلتزم كل طرف بـ: (أ) حماية المعلومات السرية بنفس العناية التي يحمي بها معلوماته السرية؛ (ب) استخدامها فقط لأغراض هذه الاتفاقية؛ (ج) الإفصاح عنها فقط للموظفين/المتعاقدين الذين يحتاجون إلى معرفتها.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "PDPL - Data Protection Principles",
    order: 21,
  },
  {
    id: "clause-conf-exclusions",
    category: "confidentiality",
    nameEn: "Confidentiality Exclusions",
    nameAr: "استثناءات السرية",
    contentEn: "Confidentiality obligations do not apply to information that: (a) is publicly available; (b) was known before disclosure; (c) is independently developed; (d) is required to be disclosed by law.",
    contentAr: "لا تنطبق التزامات السرية على المعلومات التي: (أ) متاحة للعامة؛ (ب) كانت معروفة قبل الإفصاح؛ (ج) تم تطويرها بشكل مستقل؛ (د) يتطلب القانون الإفصاح عنها.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "General Legal Principles",
    order: 22,
  },

  // Intellectual Property (3 clauses)
  {
    id: "clause-ip-ownership",
    category: "intellectual-property",
    nameEn: "Intellectual Property Ownership",
    nameAr: "ملكية الملكية الفكرية",
    contentEn: "All intellectual property developed under this Agreement shall be owned by [Party]. Pre-existing IP remains the property of its respective owner.",
    contentAr: "تكون جميع الملكية الفكرية المطورة بموجب هذه الاتفاقية ملكاً لـ [Party]. وتبقى الملكية الفكرية الموجودة مسبقاً ملكاً لصاحبها.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Saudi Intellectual Property Law",
    order: 23,
  },
  {
    id: "clause-ip-license",
    category: "intellectual-property",
    nameEn: "License Grant",
    nameAr: "منح الترخيص",
    contentEn: "Licensor grants Licensee a [exclusive/non-exclusive], [transferable/non-transferable], [perpetual/term-limited] license to use the specified intellectual property for [purpose].",
    contentAr: "يمنح المرخِّص المرخَّص له ترخيصاً [exclusive/non-exclusive]، [transferable/non-transferable]، [perpetual/term-limited] لاستخدام الملكية الفكرية المحددة لـ [purpose].",
    mandatory: false,
    customizable: true,
    saudiLawReference: "Copyright Law, Patent Law",
    order: 24,
  },
  {
    id: "clause-ip-infringement",
    category: "intellectual-property",
    nameEn: "IP Infringement Indemnity",
    nameAr: "تعويض انتهاك الملكية الفكرية",
    contentEn: "Supplier shall defend and indemnify Buyer against third-party claims that deliverables infringe Saudi intellectual property rights, and shall obtain necessary rights or replace infringing materials.",
    contentAr: "يدافع المورد ويعوض المشتري ضد مطالبات الأطراف الثالثة بأن المسلمات تنتهك حقوق الملكية الفكرية السعودية، ويحصل على الحقوق اللازمة أو يستبدل المواد المنتهكة.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "IP Protection Laws",
    order: 25,
  },

  // Data Protection (2 clauses)
  {
    id: "clause-data-pdpl",
    category: "data-protection",
    nameEn: "Personal Data Protection (PDPL)",
    nameAr: "حماية البيانات الشخصية (نظام حماية البيانات)",
    contentEn: "Both Parties shall comply with the Saudi Personal Data Protection Law (PDPL) and its implementing regulations. Data processing shall be limited to lawful purposes with appropriate security measures.",
    contentAr: "يلتزم كلا الطرفين بنظام حماية البيانات الشخصية السعودي ولوائحه التنفيذية. وتقتصر معالجة البيانات على الأغراض المشروعة مع تدابير الأمان المناسبة.",
    mandatory: true,
    customizable: false,
    saudiLawReference: "PDPL Law and Implementing Regulations",
    order: 26,
  },
  {
    id: "clause-data-localization",
    category: "data-protection",
    nameEn: "Data Localization",
    nameAr: "توطين البيانات",
    contentEn: "Critical personal data shall be stored and processed within the Kingdom of Saudi Arabia. Cross-border transfers require appropriate safeguards and regulatory approval where applicable.",
    contentAr: "تُخزن البيانات الشخصية الحرجة وتُعالج داخل المملكة العربية السعودية. وتتطلب عمليات النقل عبر الحدود ضمانات مناسبة وموافقة تنظيمية عند الاقتضاء.",
    mandatory: false,
    customizable: true,
    saudiLawReference: "PDPL - Data Transfer Requirements",
    order: 27,
  },
];

async function main() {
  console.log("🌱 Seeding standard contract clauses...");

  for (const clause of STANDARD_CLAUSES) {
    await db.standardClause.upsert({
      where: { id: clause.id },
      update: clause,
      create: clause,
    });
    console.log(`✓ Seeded: ${clause.nameEn}`);
  }

  console.log(`\n✅ Successfully seeded ${STANDARD_CLAUSES.length} standard clauses`);
}

main()
  .catch((e) => {
    console.error("❌ Error seeding clauses:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
