/**
 * Guard tests for voice tool argument validation.
 *
 * The AI SDK's `tool()` helper is an identity function: `inputSchema` is
 * enforced by the tool-calling loop, not by `execute`. The realtime voice
 * endpoint dispatches to `execute` directly, so it must validate for itself.
 * Without this the browser could call every registered tool with arbitrary
 * arguments.
 */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { validateVoiceToolInput } from "@/lib/agents/platform/realtime";

const schema = z.object({
  projectId: z.string().min(1),
  limit: z.number().int().positive().max(50),
});

describe("validateVoiceToolInput", () => {
  test("returns parsed data for input matching the tool schema", () => {
    const result = validateVoiceToolInput(
      "listDocuments",
      { inputSchema: schema },
      { projectId: "proj-1", limit: 10 }
    );
    expect(result).toEqual({ projectId: "proj-1", limit: 10 });
  });

  test("rejects input violating the tool schema", () => {
    expect(() =>
      validateVoiceToolInput(
        "listDocuments",
        { inputSchema: schema },
        { projectId: "", limit: 10 }
      )
    ).toThrow(/Invalid arguments for tool: listDocuments/);
  });

  test("rejects input violating a numeric bound", () => {
    expect(() =>
      validateVoiceToolInput(
        "listDocuments",
        { inputSchema: schema },
        { projectId: "proj-1", limit: 5000 }
      )
    ).toThrow(/Invalid arguments for tool/);
  });

  test("rejects a wholly unexpected payload shape", () => {
    for (const bad of [null, "string", 42, [], { unrelated: true }]) {
      expect(() =>
        validateVoiceToolInput("listDocuments", { inputSchema: schema }, bad)
      ).toThrow(/Invalid arguments for tool/);
    }
  });

  test("passes arguments through for a tool that declares no schema", () => {
    expect(validateVoiceToolInput("ping", {}, { anything: 1 })).toEqual({
      anything: 1,
    });
  });

  test("fails closed when a schema is present but cannot be evaluated", () => {
    expect(() =>
      validateVoiceToolInput(
        "brokenTool",
        { inputSchema: { notASchema: true } },
        {}
      )
    ).toThrow(/unvalidatable input schema/);
  });

  test("strips unknown keys rather than forwarding them to execute", () => {
    const result = validateVoiceToolInput(
      "listDocuments",
      { inputSchema: schema },
      { projectId: "proj-1", limit: 10, injected: "ignore-me" }
    ) as Record<string, unknown>;
    expect(result).not.toHaveProperty("injected");
  });
});
