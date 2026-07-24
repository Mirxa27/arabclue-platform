-- Bind every reviewed knowledge record to the exact immutable document
-- version and checksum used during approval. The composite foreign keys make
-- evidence deletion and checksum drift fail closed at the database boundary.

CREATE UNIQUE INDEX "DocumentVersion_documentId_version_checksum_key"
  ON "DocumentVersion"("documentId", "version", "checksum");

ALTER TABLE "PastProject"
  ADD COLUMN "evidenceDocumentId" TEXT,
  ADD COLUMN "evidenceVersion" INTEGER,
  ADD COLUMN "evidenceChecksum" TEXT;
ALTER TABLE "Certificate"
  ADD COLUMN "evidenceDocumentId" TEXT,
  ADD COLUMN "evidenceVersion" INTEGER,
  ADD COLUMN "evidenceChecksum" TEXT;
ALTER TABLE "MethodologyAsset"
  ADD COLUMN "evidenceDocumentId" TEXT,
  ADD COLUMN "evidenceVersion" INTEGER,
  ADD COLUMN "evidenceChecksum" TEXT;
ALTER TABLE "ContentLibraryItem"
  ADD COLUMN "evidenceDocumentId" TEXT,
  ADD COLUMN "evidenceVersion" INTEGER,
  ADD COLUMN "evidenceChecksum" TEXT;

-- Preserve any already-valid reviewed bindings when this migration is applied
-- independently. Rows whose legacy reference does not resolve exactly remain
-- unbound and therefore ineligible in the application until re-reviewed.
UPDATE "PastProject" AS knowledge
SET
  "evidenceDocumentId" = version."documentId",
  "evidenceVersion" = version."version",
  "evidenceChecksum" = lower(version."checksum")
FROM "DocumentVersion" AS version
WHERE knowledge."reviewStatus" IN ('APPROVED', 'REVOKED')
  AND version."checksum" IS NOT NULL
  AND knowledge."evidenceRef" =
    'uploaded-document:' || version."documentId" ||
    ':v' || version."version"::text ||
    ':sha256:' || lower(version."checksum");

UPDATE "Certificate" AS knowledge
SET
  "evidenceDocumentId" = version."documentId",
  "evidenceVersion" = version."version",
  "evidenceChecksum" = lower(version."checksum")
FROM "DocumentVersion" AS version
WHERE knowledge."reviewStatus" IN ('APPROVED', 'REVOKED')
  AND version."checksum" IS NOT NULL
  AND knowledge."evidenceRef" =
    'uploaded-document:' || version."documentId" ||
    ':v' || version."version"::text ||
    ':sha256:' || lower(version."checksum");

UPDATE "MethodologyAsset" AS knowledge
SET
  "evidenceDocumentId" = version."documentId",
  "evidenceVersion" = version."version",
  "evidenceChecksum" = lower(version."checksum")
FROM "DocumentVersion" AS version
WHERE knowledge."reviewStatus" IN ('APPROVED', 'REVOKED')
  AND version."checksum" IS NOT NULL
  AND knowledge."evidenceRef" =
    'uploaded-document:' || version."documentId" ||
    ':v' || version."version"::text ||
    ':sha256:' || lower(version."checksum");

UPDATE "ContentLibraryItem" AS knowledge
SET
  "evidenceDocumentId" = version."documentId",
  "evidenceVersion" = version."version",
  "evidenceChecksum" = lower(version."checksum")
FROM "DocumentVersion" AS version
WHERE knowledge."reviewStatus" IN ('APPROVED', 'REVOKED')
  AND version."checksum" IS NOT NULL
  AND knowledge."evidenceRef" =
    'uploaded-document:' || version."documentId" ||
    ':v' || version."version"::text ||
    ':sha256:' || lower(version."checksum");

ALTER TABLE "PastProject"
  ADD CONSTRAINT "PastProject_evidenceVersionRecord_fkey"
  FOREIGN KEY ("evidenceDocumentId", "evidenceVersion", "evidenceChecksum")
  REFERENCES "DocumentVersion"("documentId", "version", "checksum")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Certificate"
  ADD CONSTRAINT "Certificate_evidenceVersionRecord_fkey"
  FOREIGN KEY ("evidenceDocumentId", "evidenceVersion", "evidenceChecksum")
  REFERENCES "DocumentVersion"("documentId", "version", "checksum")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MethodologyAsset"
  ADD CONSTRAINT "MethodologyAsset_evidenceVersionRecord_fkey"
  FOREIGN KEY ("evidenceDocumentId", "evidenceVersion", "evidenceChecksum")
  REFERENCES "DocumentVersion"("documentId", "version", "checksum")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ContentLibraryItem"
  ADD CONSTRAINT "ContentLibraryItem_evidenceVersionRecord_fkey"
  FOREIGN KEY ("evidenceDocumentId", "evidenceVersion", "evidenceChecksum")
  REFERENCES "DocumentVersion"("documentId", "version", "checksum")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "PastProject_evidenceDocumentId_evidenceVersion_idx"
  ON "PastProject"("evidenceDocumentId", "evidenceVersion");
CREATE INDEX "Certificate_evidenceDocumentId_evidenceVersion_idx"
  ON "Certificate"("evidenceDocumentId", "evidenceVersion");
CREATE INDEX "MethodologyAsset_evidenceDocumentId_evidenceVersion_idx"
  ON "MethodologyAsset"("evidenceDocumentId", "evidenceVersion");
CREATE INDEX "ContentLibraryItem_evidenceDocumentId_evidenceVersion_idx"
  ON "ContentLibraryItem"("evidenceDocumentId", "evidenceVersion");

-- NOT VALID keeps unresolved legacy review history available for explicit
-- re-review while enforcing exact bindings on every new or updated row.
ALTER TABLE "PastProject" ADD CONSTRAINT "PastProject_evidence_binding_check"
  CHECK (
    (
      "reviewStatus" = 'UNREVIEWED'
      AND "evidenceDocumentId" IS NULL
      AND "evidenceVersion" IS NULL
      AND "evidenceChecksum" IS NULL
    ) OR (
      "reviewStatus" IN ('APPROVED', 'REVOKED')
      AND "evidenceDocumentId" IS NOT NULL
      AND "evidenceVersion" > 0
      AND "evidenceChecksum" ~ '^[a-f0-9]{64}$'
      AND "evidenceRef" =
        'uploaded-document:' || "evidenceDocumentId" ||
        ':v' || "evidenceVersion"::text ||
        ':sha256:' || "evidenceChecksum"
    )
  ) NOT VALID;
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_evidence_binding_check"
  CHECK (
    (
      "reviewStatus" = 'UNREVIEWED'
      AND "evidenceDocumentId" IS NULL
      AND "evidenceVersion" IS NULL
      AND "evidenceChecksum" IS NULL
    ) OR (
      "reviewStatus" IN ('APPROVED', 'REVOKED')
      AND "evidenceDocumentId" IS NOT NULL
      AND "evidenceVersion" > 0
      AND "evidenceChecksum" ~ '^[a-f0-9]{64}$'
      AND "evidenceRef" =
        'uploaded-document:' || "evidenceDocumentId" ||
        ':v' || "evidenceVersion"::text ||
        ':sha256:' || "evidenceChecksum"
    )
  ) NOT VALID;
ALTER TABLE "MethodologyAsset" ADD CONSTRAINT "MethodologyAsset_evidence_binding_check"
  CHECK (
    (
      "reviewStatus" = 'UNREVIEWED'
      AND "evidenceDocumentId" IS NULL
      AND "evidenceVersion" IS NULL
      AND "evidenceChecksum" IS NULL
    ) OR (
      "reviewStatus" IN ('APPROVED', 'REVOKED')
      AND "evidenceDocumentId" IS NOT NULL
      AND "evidenceVersion" > 0
      AND "evidenceChecksum" ~ '^[a-f0-9]{64}$'
      AND "evidenceRef" =
        'uploaded-document:' || "evidenceDocumentId" ||
        ':v' || "evidenceVersion"::text ||
        ':sha256:' || "evidenceChecksum"
    )
  ) NOT VALID;
ALTER TABLE "ContentLibraryItem" ADD CONSTRAINT "ContentLibraryItem_evidence_binding_check"
  CHECK (
    (
      "reviewStatus" = 'UNREVIEWED'
      AND "evidenceDocumentId" IS NULL
      AND "evidenceVersion" IS NULL
      AND "evidenceChecksum" IS NULL
    ) OR (
      "reviewStatus" IN ('APPROVED', 'REVOKED')
      AND "evidenceDocumentId" IS NOT NULL
      AND "evidenceVersion" > 0
      AND "evidenceChecksum" ~ '^[a-f0-9]{64}$'
      AND "evidenceRef" =
        'uploaded-document:' || "evidenceDocumentId" ||
        ':v' || "evidenceVersion"::text ||
        ':sha256:' || "evidenceChecksum"
    )
  ) NOT VALID;
