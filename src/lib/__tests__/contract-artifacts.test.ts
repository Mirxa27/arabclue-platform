import { describe, expect, test } from "bun:test";
import { parseContractArtifacts } from "../contract-artifacts";

describe("contract artifact parsing", () => {
  test("parses milestones stored alongside articles", () => {
    const artifacts = parseContractArtifacts(
      JSON.stringify({
        articles: [{ title: "Obligations", body: "Supplier shall report monthly." }],
        milestones: [
          { name: "Kickoff", weeks: 1 },
          { title: "Go-live", weeks: 12 },
          { weeks: 20 },
        ],
      })
    );

    expect(artifacts.articles).toHaveLength(1);
    expect(artifacts.milestones).toEqual([
      { name: "Kickoff", title: undefined, weeks: 1 },
      { name: undefined, title: "Go-live", weeks: 12 },
    ]);
  });

  test("parses milestones stored under entities from array-wrapped artifacts", () => {
    const artifacts = parseContractArtifacts(
      JSON.stringify([
        {
          entities: {
            milestones: [{ title: "Acceptance", weeks: 8 }],
          },
        },
      ])
    );

    expect(artifacts.milestones).toEqual([
      { name: undefined, title: "Acceptance", weeks: 8 },
    ]);
  });
});
