import { describe, expect, test } from "bun:test";
import {
  getReviewDecisionProposalStatus,
  getSubmittedForReviewStatus,
  getContractExportReadiness,
} from "../contract-review";

function validContractFixture() {
  return `# DRAFT CONTRACT | مسودة عقد
> NOT LEGAL ADVICE | ليست استشارة قانونية
> Authorized human legal review required before signature.

# RESEARCH SUMMARY | موجز البحث

## Findings | النتائج
- Finding grounded in tender context.

## Sources (registry) | المصادر (السجل)
- Saudi instrument (current, review 2026-01-01) — registry reference

# OPERATIVE ARTICLES | البنود النافذة

### Article 1 — Parties | المادة 1 — الأطراف
:::en
English parties clause.
:::
:::ar
نص بند الأطراف بالعربية.
:::

### Article 2 — Scope | المادة 2 — النطاق
:::en
English scope clause.
:::
:::ar
نص بند النطاق بالعربية.
:::

### Article 3 — Term | المادة 3 — المدة
:::en
English term clause.
:::
:::ar
نص بند المدة بالعربية.
:::

### Article 4 — Obligations | المادة 4 — الالتزامات
:::en
English obligations clause.
:::
:::ar
نص بند الالتزامات بالعربية.
:::

### Article 5 — Review | المادة 5 — المراجعة
:::en
Human legal review is required before signature.
:::
:::ar
يلزم مراجعة قانونية بشرية قبل التوقيع.
:::

---
Contract drafts and regulatory comments are drafting aids, not legal advice. Authorized human legal review and approval required before signature.`;
}

describe("contract legal review lifecycle", () => {
  test("submit, final approval, and PDF export readiness share the proposal review chain", () => {
    const submittedStatus = getSubmittedForReviewStatus();
    expect(submittedStatus).toBe("REVIEW");

    const intermediateStatus = getReviewDecisionProposalStatus({
      decision: "APPROVED",
      pendingReviewsAfterDecision: 1,
    });
    expect(intermediateStatus).toBe("REVIEWED");

    const finalStatus = getReviewDecisionProposalStatus({
      decision: "APPROVED",
      pendingReviewsAfterDecision: 0,
    });
    expect(finalStatus).toBe("APPROVED");

    const inReview = getContractExportReadiness({
      contentMd: validContractFixture(),
      proposalStatus: submittedStatus,
      format: "pdf",
      hasApprovalPolicy: true,
      checkedAt: "2026-07-23T00:00:00.000Z",
    });
    expect(inReview.validation.blocking).toBe(false);
    expect(inReview.exportReady).toBe(false);
    expect(inReview.exportBlocker?.code).toBe("approval_required");

    const approved = getContractExportReadiness({
      contentMd: validContractFixture(),
      proposalStatus: finalStatus,
      format: "pdf",
      hasApprovalPolicy: true,
      checkedAt: "2026-07-23T00:00:00.000Z",
    });
    expect(approved.validation.blocking).toBe(false);
    expect(approved.exportReady).toBe(true);
    expect(approved.exportBlocker).toBeNull();
  });
});
