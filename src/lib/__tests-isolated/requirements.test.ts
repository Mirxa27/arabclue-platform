import { beforeAll, describe, expect, test } from "bun:test";
import { mock } from "bun:test";

// Mock db with in-memory state
let mockCerts: any[] = [];
let mockPastProjects: any[] = [];
let mockLibraryItems: any[] = [];
let mockMethodologies: any[] = [];
let mockExistingReqs: any[] = [];
let createManyCalls: any[] = [];
let deleteManyCalls: any[] = [];
let updateCalls: any[] = [];

type RequirementsModule = typeof import("../requirements");
let persistTenderRequirements: RequirementsModule["persistTenderRequirements"];
let applyCoveragePlanToRequirements: RequirementsModule["applyCoveragePlanToRequirements"];

beforeAll(async () => {
mock.module("../db", () => ({
  db: {
    certificate: {
      findMany: mock(() => Promise.resolve(mockCerts)),
    },
    pastProject: {
      findMany: mock(() => Promise.resolve(mockPastProjects)),
    },
    contentLibraryItem: {
      findMany: mock(() => Promise.resolve(mockLibraryItems)),
    },
    methodologyAsset: {
      findMany: mock(() => Promise.resolve(mockMethodologies)),
    },
    tenderRequirement: {
      deleteMany: mock((args: any) => {
        deleteManyCalls.push(args);
        return Promise.resolve({ count: 0 });
      }),
      createMany: mock((args: any) => {
        createManyCalls.push(args);
        return Promise.resolve({ count: args.data.length });
      }),
      findMany: mock(() => Promise.resolve(mockExistingReqs)),
      update: mock((args: any) => {
        updateCalls.push(args);
        return Promise.resolve({ id: "req-1" });
      }),
    },
  },
}));

// Mock knowledge-approval to return valid content/hashes
mock.module("../knowledge-approval", () => ({
  certificateKnowledgeContent: mock((c: any) => `${c.name}:${c.issuer}`),
  pastProjectKnowledgeContent: mock((p: any) => `${p.title}:${p.summary}`),
  libraryKnowledgeContent: mock((l: any) => `${l.title}:${l.category}`),
  methodologyKnowledgeContent: mock((m: any) => `${m.title}:${m.category}`),
  hashKnowledgeContent: mock((s: string) => `hash:${s.slice(0, 20)}`),
}));

// Mock knowledge-eligibility to return eligible=true
mock.module("../knowledge-eligibility", () => ({
  isCertificateValid: mock(() => ({ eligible: true })),
  isPastProjectEligible: mock(() => ({ eligible: true })),
  isLibraryItemEligible: mock(() => ({ eligible: true })),
  isMethodologyEligible: mock(() => ({ eligible: true })),
}));

// Mock text-quality
mock.module("../text-quality", () => ({
  isQualityRequirementText: mock((text: string) => text.length >= 10),
  isQualityScopeText: mock((text: string) => text.length >= 40),
}));

// Mock coverage
mock.module("../agents/coverage", () => ({
  coverageStatusToRequirementStatus: mock((status: string) => {
    if (status === "COVERED") return "COVERED";
    if (status === "PARTIAL") return "IN_PROGRESS";
    return "MISSING";
  }),
}));

({ persistTenderRequirements, applyCoveragePlanToRequirements } = await import(
  "../requirements"
));
});

function resetState() {
  mockCerts = [];
  mockPastProjects = [];
  mockLibraryItems = [];
  mockMethodologies = [];
  mockExistingReqs = [];
  createManyCalls = [];
  deleteManyCalls = [];
  updateCalls = [];
}

function makeEntities(requirements: any[] = []) {
  return {
    scope: "IT infrastructure development and maintenance services scope description here",
    evaluation: { technical: 70, financial: 30 },
    sla: { perWeek: 2, maxPercent: 20 },
    milestones: [],
    evidence: [],
    requirements,
  };
}

describe("persistTenderRequirements", () => {
  test("returns 0 when no requirements extracted and no entities", async () => {
    resetState();
    const count = await persistTenderRequirements("proj-1", "ws-1", null, "");
    expect(count).toBe(0);
  });

  test("persists requirements from entities", async () => {
    resetState();
    const entities = makeEntities([
      { text: "The contractor shall provide all necessary equipment for the project execution phase" },
      { text: "The vendor must comply with all Saudi local content requirements as specified" },
    ]);
    const count = await persistTenderRequirements("proj-1", "ws-1", entities, "");
    expect(count).toBe(2);
    expect(createManyCalls.length).toBe(1);
    expect(createManyCalls[0].data).toHaveLength(2);
  });

  test("extracts requirements from text when entities have no requirements", async () => {
    resetState();
    const text = "- The contractor shall provide all necessary equipment for the project execution phase and deliverables\n- The vendor must comply with all Saudi local content requirements as specified in the tender";
    const count = await persistTenderRequirements("proj-1", "ws-1", makeEntities([]), text);
    expect(count).toBeGreaterThan(0);
  });

  test("deletes existing requirements before creating new ones", async () => {
    resetState();
    const entities = makeEntities([
      { text: "The contractor shall provide all necessary equipment for the project execution phase" },
    ]);
    await persistTenderRequirements("proj-1", "ws-1", entities, "");
    expect(deleteManyCalls.length).toBe(1);
    expect(deleteManyCalls[0].where.projectId).toBe("proj-1");
  });

  test("links requirements to matching certificates", async () => {
    resetState();
    mockCerts = [
      {
        id: "cert-1",
        name: "ISO 27001",
        certType: "Security",
        number: "CERT-001",
        workspaceId: "ws-1",
        approved: true,
        reviewStatus: "APPROVED",
        revokedAt: null,
        evidenceRef: "ref",
        provenanceJson: "{}",
        reviewedById: "r-1",
        approvedAt: new Date(),
        contentHash: "hash",
        expiresAt: null,
        issuer: "Issuer",
      },
    ];
    const entities = makeEntities([
      { text: "The contractor shall have ISO 27001 certification for security compliance" },
    ]);
    const count = await persistTenderRequirements("proj-1", "ws-1", entities, "");
    expect(count).toBe(1);
    const row = createManyCalls[0].data[0];
    expect(row.linkedResourceType).toBe("CERTIFICATE");
    expect(row.linkedResourceId).toBe("cert-1");
  });

  test("assigns MISSING status when no matching assets", async () => {
    resetState();
    const entities = makeEntities([
      { text: "The contractor shall provide something completely unrelated to any assets" },
    ]);
    const count = await persistTenderRequirements("proj-1", "ws-1", entities, "");
    expect(count).toBe(1);
    const row = createManyCalls[0].data[0];
    expect(row.status).toBe("MISSING");
    expect(row.linkedResourceId).toBeNull();
  });

  test("truncates requirement text to 2000 chars", async () => {
    resetState();
    const longText = "A".repeat(3000);
    const entities = makeEntities([{ text: longText }]);
    const count = await persistTenderRequirements("proj-1", "ws-1", entities, "");
    expect(count).toBe(1);
    expect(createManyCalls[0].data[0].text.length).toBe(2000);
  });

  test("assigns sortOrder index to requirements", async () => {
    resetState();
    const entities = makeEntities([
      { text: "First requirement shall be done properly here" },
      { text: "Second requirement must be completed on time" },
    ]);
    await persistTenderRequirements("proj-1", "ws-1", entities, "");
    expect(createManyCalls[0].data[0].sortOrder).toBe(0);
    expect(createManyCalls[0].data[1].sortOrder).toBe(1);
  });
});

describe("applyCoveragePlanToRequirements", () => {
  test("returns 0 when no existing requirements and no coverage rows", async () => {
    resetState();
    mockExistingReqs = [];
    const count = await applyCoveragePlanToRequirements("proj-1", {
      rows: [],
    } as any);
    expect(count).toBe(0);
  });

  test("creates requirements from coverage when none exist", async () => {
    resetState();
    mockExistingReqs = [];
    const coverage = {
      rows: [
        {
          requirementText: "Requirement text here that is long enough",
          sectionRef: "S1",
          pageRef: "1",
          status: "COVERED",
          evidenceIds: ["ev-1"],
        },
      ],
    } as any;
    const count = await applyCoveragePlanToRequirements("proj-1", coverage);
    expect(count).toBe(1);
    expect(createManyCalls.length).toBe(1);
  });

  test("updates existing requirements when coverage matches", async () => {
    resetState();
    mockExistingReqs = [
      {
        id: "req-1",
        text: "The contractor shall provide all necessary equipment for the project",
        sortOrder: 0,
        linkedResourceId: null,
      },
    ];
    const coverage = {
      rows: [
        {
          requirementText: "contractor shall provide all necessary equipment",
          sectionRef: null,
          pageRef: null,
          status: "COVERED",
          evidenceIds: ["ev-1"],
        },
      ],
    } as any;
    const count = await applyCoveragePlanToRequirements("proj-1", coverage);
    expect(count).toBe(1);
    expect(updateCalls.length).toBe(1);
  });

  test("skips coverage rows with no match", async () => {
    resetState();
    mockExistingReqs = [
      {
        id: "req-1",
        text: "Completely different requirement text here",
        sortOrder: 0,
        linkedResourceId: null,
      },
    ];
    const coverage = {
      rows: [
        {
          requirementText: "something totally unrelated zzzz",
          sectionRef: null,
          pageRef: null,
          status: "COVERED",
          evidenceIds: [],
        },
      ],
    } as any;
    const count = await applyCoveragePlanToRequirements("proj-1", coverage);
    expect(count).toBe(0);
    expect(updateCalls.length).toBe(0);
  });
});
