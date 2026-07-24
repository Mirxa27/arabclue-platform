import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260725003000_contract_draft_persistence/migration.sql"
  ),
  "utf8"
);
const service = readFileSync(
  resolve(process.cwd(), "src/lib/contract-template-persistence.ts"),
  "utf8"
);

describe("contract draft database and transaction invariants", () => {
  test("adds tenant-scoped uniqueness for catalog identity and idempotency", () => {
    expect(migration).toContain(
      '"ContractTemplate_workspaceId_catalogKey_key"'
    );
    expect(migration).toContain('("workspaceId", "catalogKey")');
    expect(migration).toContain(
      '"GeneratedContract_workspaceId_clientRequestId_key"'
    );
    expect(migration).toContain('("workspaceId", "clientRequestId")');
  });

  test("forces generation-schema version 1 rows to remain complete unreviewed drafts", () => {
    expect(migration).toContain('"generationSchemaVersion" IN (0, 1)');
    expect(migration).toContain('"templateVersionId" IS NOT NULL');
    expect(migration).toContain('"documentSpecJson" IS NOT NULL');
    expect(migration).toContain(
      '"generationMode" IN (\'PREVIEW\', \'FINAL\')'
    );
    expect(migration).toContain('"diagnosticCount" >= 0');
    expect(migration).toContain(
      '"storageBytes" BETWEEN 1 AND 4194304'
    );
    expect(migration).toContain('"legalReviewStatus" = \'UNREVIEWED\'');
    expect(migration).toContain('"counselReviewRequired" = true');
    expect(migration).toContain('"isExecutable" = false');
    expect(migration).toContain('"contentPdfPath" IS NULL');
    expect(migration).toContain('"status" = \'draft\'');
  });

  test("writes the draft and its creation audit in the same serializable transaction", () => {
    expect(service).toContain("Prisma.TransactionIsolationLevel.Serializable");
    expect(service).toContain("await tx.generatedContract.create");
    expect(service).toContain("await tx.auditLog.create");
    expect(service.indexOf("await tx.generatedContract.create")).toBeLessThan(
      service.indexOf("await tx.auditLog.create")
    );
    expect(service).toContain("AUDIT_ACTIONS.CONTRACT_DRAFT_CREATE");
  });

  test("provides an audited tenant-scoped recovery path for active-draft quotas", () => {
    expect(service).toContain("export async function deletePersistedContractDraft");
    expect(service).toContain("AUDIT_ACTIONS.CONTRACT_DRAFT_DELETE");
    expect(service).toContain("await tx.generatedContract.deleteMany");
    expect(service).toContain("workspaceId: input.workspaceId");
  });
});
