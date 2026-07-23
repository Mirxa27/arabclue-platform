import { describe, expect, test } from "bun:test";
import { MISSION_CONNECTORS } from "@/lib/agents/platform/connectors";

describe("chrome extension connector registry", () => {
  test("exposes chrome_extension as ready connector", () => {
    const ext = MISSION_CONNECTORS.find((c) => c.id === "chrome_extension");
    expect(ext).toBeTruthy();
    expect(ext!.status).toBe("ready");
  });
});
