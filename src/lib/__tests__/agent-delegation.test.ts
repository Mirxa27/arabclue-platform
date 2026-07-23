import { describe, expect, test } from "bun:test";
import {
  buildDelegationPlan,
  roleCapabilities,
} from "@/lib/agents/platform/delegation";
import { extractDelegationPlan } from "@/lib/agents/platform/mission-tool-parts";

describe("agent delegation plan", () => {
  test("commands the full ordered 6-agent team", () => {
    const plan = buildDelegationPlan();
    expect(plan).toHaveLength(6);
    expect(plan.map((p) => p.id)).toEqual([
      "INGESTION",
      "COMPLIANCE_REGULATORY",
      "TECHNICAL_ARCHITECT",
      "FINANCIAL_QUALIFICATION",
      "PROPOSAL_DRAFTING",
      "LAW_CONTRACT",
    ]);
    expect(plan[0].order).toBe(1);
    expect(plan.every((p) => p.command.length > 0 && p.commandAr.length > 0)).toBe(
      true
    );
    // financial agent must never price
    const fin = plan.find((p) => p.id === "FINANCIAL_QUALIFICATION");
    expect(fin?.command.toLowerCase()).toContain("never");
  });

  test("extractDelegationPlan reads a plan from tool output", () => {
    const plan = extractDelegationPlan([
      {
        id: "t1",
        name: "orchestrateTenderPackage",
        state: "output-available",
        messageId: "m1",
        output: {
          ok: true,
          delegationPlan: buildDelegationPlan().map((a) => ({
            id: a.id,
            order: a.order,
            label: a.label,
            command: a.command,
          })),
        },
      },
    ]);
    expect(plan).toBeTruthy();
    expect(plan?.length).toBe(6);
    expect(plan?.[0].order).toBe(1);
  });

  test("returns null when no plan present", () => {
    expect(
      extractDelegationPlan([
        { id: "x", name: "listProjects", state: "output-available", messageId: "m", output: { projects: [] } },
      ])
    ).toBeNull();
  });
});

describe("role capabilities (agent = user role)", () => {
  test("admin gets admin level + admin skill enabled", () => {
    const caps = roleCapabilities({ role: "ADMIN", canWrite: true, isAdmin: true });
    expect(caps.level).toBe("admin");
    expect(caps.skills.find((s) => s.id === "admin")?.allowed).toBe(true);
    expect(caps.skills.find((s) => s.id === "run_pipeline")?.allowed).toBe(true);
  });

  test("editor (writer) can run pipeline but not admin", () => {
    const caps = roleCapabilities({ role: "BIDDER", canWrite: true, isAdmin: false });
    expect(caps.level).toBe("editor");
    expect(caps.skills.find((s) => s.id === "admin")?.allowed).toBe(false);
    expect(caps.skills.find((s) => s.id === "run_pipeline")?.allowed).toBe(true);
    expect(caps.skills.find((s) => s.id === "create_project")?.allowed).toBe(true);
  });

  test("reviewer is read-only", () => {
    const caps = roleCapabilities({
      role: "REVIEWER",
      canWrite: false,
      isAdmin: false,
    });
    expect(caps.level).toBe("reviewer");
    expect(caps.skills.find((s) => s.id === "run_pipeline")?.allowed).toBe(false);
    expect(caps.skills.find((s) => s.id === "create_project")?.allowed).toBe(false);
    expect(caps.skills.find((s) => s.id === "read")?.allowed).toBe(true);
    expect(caps.skills.find((s) => s.id === "review")?.allowed).toBe(true);
  });
});
