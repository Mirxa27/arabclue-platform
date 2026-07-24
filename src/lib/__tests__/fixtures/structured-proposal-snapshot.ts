import type {
  ProposalModuleKey,
  ProposalSnapshot,
} from "../../proposal-layouts";

const REQUIRED_ADDENDUM_MODULES = [
  "cover",
  "document-control",
  "assumptions-dependencies-deviations",
  "appendices-evidence-validation",
] as const satisfies readonly ProposalModuleKey[];

export function structuredProposalSnapshotFixture(
  proposalId = "proposal-structured-1",
  version = 1
): ProposalSnapshot {
  const sources = REQUIRED_ADDENDUM_MODULES.map((key) => ({
    id: `source-${key}`,
    kind: "USER_ENTRY" as const,
    title: {
      en: `Approved input for ${key}`,
      ar: `مدخل معتمد للوحدة ${key}`,
    },
    locator: `fixture:${key}`,
    asOf: "2026-07-24",
  }));
  return {
    schemaVersion: 1,
    snapshotId: proposalId,
    version,
    intent: "ADDENDUM",
    languageMode: "BILINGUAL",
    projectTitle: {
      en: "Digital services addendum",
      ar: "ملحق الخدمات الرقمية",
    },
    bidderName: {
      en: "Fixture Bidder",
      ar: "مقدم العرض التجريبي",
    },
    tenderReference: "TENDER-2026-001",
    brand: {
      primaryColor: "#173F5F",
      secondaryColor: "#20639B",
      accentColor: "#D68C20",
      backgroundColor: "#FFFFFF",
      textColor: "#132238",
    },
    sources,
    modules: REQUIRED_ADDENDUM_MODULES.map((key) => {
      const blockKey = `${key}.statement`;
      return {
        key,
        title: {
          en: `Module ${key}`,
          ar: `الوحدة ${key}`,
        },
        requiredBlockKeys: [blockKey],
        blocks: [
          {
            type: "NARRATIVE" as const,
            key: blockKey,
            title: {
              en: `Statement for ${key}`,
              ar: `بيان الوحدة ${key}`,
            },
            body: {
              en: `Explicit sourced English content for ${key}.`,
              ar: `محتوى عربي صريح وموثق للوحدة ${key}.`,
            },
            sourceRequired: true,
            sourceRefs: [`source-${key}`],
          },
        ],
      };
    }),
  };
}
