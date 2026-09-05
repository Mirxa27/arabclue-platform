import { describe, expect, test } from "bun:test";
import {
  complianceScoreFromGroups,
  countForStatus,
  totalCount,
} from "../stats-compliance";

describe("complianceScoreFromGroups", () => {
  test("returns null when the workspace has no compliance checks", () => {
    // Arrange
    const groups: never[] = [];

    // Act
    const score = complianceScoreFromGroups(groups);

    // Assert — not 100: a new user must not see "100% compliance".
    expect(score).toBeNull();
  });

  test("rounds the COMPLIANT share of all checks", () => {
    // Arrange
    const groups = [
      { status: "COMPLIANT", _count: 2 },
      { status: "PARTIAL", _count: 1 },
    ];

    // Act
    const score = complianceScoreFromGroups(groups);

    // Assert
    expect(score).toBe(67);
  });

  test("reads Prisma's `_count: { _all }` shape as well as the plain number", () => {
    // Arrange
    const groups = [
      { status: "COMPLIANT", _count: { _all: 3 } },
      { status: "NON_COMPLIANT", _count: { _all: 1 } },
    ];

    // Act
    const score = complianceScoreFromGroups(groups);

    // Assert
    expect(score).toBe(75);
  });

  test("scores 0 when checks exist but none is compliant", () => {
    expect(
      complianceScoreFromGroups([{ status: "NON_COMPLIANT", _count: 4 }])
    ).toBe(0);
  });
});

describe("status group helpers", () => {
  test("countForStatus is 0 for a status with no group", () => {
    expect(countForStatus([{ status: "COMPLETED", _count: 2 }], "RUNNING")).toBe(0);
  });

  test("totalCount sums every group", () => {
    expect(
      totalCount([
        { status: "RUNNING", _count: 1 },
        { status: "COMPLETED", _count: { _all: 5 } },
      ])
    ).toBe(6);
  });
});
