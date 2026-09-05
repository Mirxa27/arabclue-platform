import { describe, expect, test } from "bun:test";
import {
  PRESENCE_SECTION_KEY_MAX_LENGTH,
  presenceEventSchema,
} from "../collaboration-presence";

describe("presenceEventSchema", () => {
  test("accepts join/heartbeat/leave with an optional bounded sectionKey", () => {
    // Arrange
    const join = { proposalId: "prop_1", type: "join", sectionKey: "executive-summary" };
    const beacon = { proposalId: "prop_1", type: "leave" };
    const clear = { proposalId: "prop_1", type: "heartbeat", sectionKey: null };

    // Act / Assert
    expect(presenceEventSchema.parse(join)).toEqual(join);
    expect(presenceEventSchema.parse(beacon)).toEqual(beacon);
    expect(presenceEventSchema.parse(clear)).toEqual(clear);
  });

  test("rejects a sectionKey over the stored length", () => {
    const result = presenceEventSchema.safeParse({
      proposalId: "prop_1",
      type: "heartbeat",
      sectionKey: "x".repeat(PRESENCE_SECTION_KEY_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    expect(
      presenceEventSchema.safeParse({
        proposalId: "prop_1",
        type: "heartbeat",
        sectionKey: "x".repeat(PRESENCE_SECTION_KEY_MAX_LENGTH),
      }).success
    ).toBe(true);
  });

  test("rejects unknown event types and non-string section keys", () => {
    expect(
      presenceEventSchema.safeParse({ proposalId: "prop_1", type: "typing" }).success
    ).toBe(false);
    expect(
      presenceEventSchema.safeParse({
        proposalId: "prop_1",
        type: "join",
        sectionKey: { $gt: "" },
      }).success
    ).toBe(false);
  });

  test("refuses smuggled tenant fields and a missing proposal id", () => {
    expect(
      presenceEventSchema.safeParse({
        proposalId: "prop_1",
        type: "join",
        workspaceId: "someone-elses-workspace",
      }).success
    ).toBe(false);
    expect(presenceEventSchema.safeParse({ type: "join" }).success).toBe(false);
    expect(presenceEventSchema.safeParse(null).success).toBe(false);
  });
});
