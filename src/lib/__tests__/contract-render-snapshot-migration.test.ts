import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

describe("contract render snapshot migration", () => {
  test("keeps schema and additive database integrity constraints aligned", async () => {
    const [schema, migration] = await Promise.all([
      Bun.file(resolve(root, "prisma/schema.prisma")).text(),
      Bun.file(
        resolve(
          root,
          "prisma/migrations/20260725004000_contract_render_snapshot/migration.sql"
        )
      ).text(),
    ]);

    for (const field of [
      "contractRenderSnapshot",
      "contractRenderSnapshotHash",
      "contractRenderSnapshotRevision",
    ]) {
      expect(schema).toContain(field);
      expect(migration).toContain(field);
    }
    expect(migration).toContain(
      "GeneratedProposal_contract_render_snapshot_integrity_check"
    );
    expect(migration).toContain(
      "GeneratedProposal_workspaceId_contractRenderSnapshotHash_idx"
    );
    expect(migration).toContain(
      `"contractRenderSnapshotRevision" > 0`
    );
  });
});
