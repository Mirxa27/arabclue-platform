import { describe, expect, test } from "bun:test";
import { submitProposalWithStructuredSnapshot } from "../proposal-submit-client";

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("proposal editor structured submit bridge", () => {
  test("hydrates a generated proposal before submitting it", async () => {
    const calls: { url: string; method: string }[] = [];
    const result = await submitProposalWithStructuredSnapshot({
      proposalId: "proposal-1",
      currentContentMd: "# Current",
      currentLocale: "en",
      persistedContentMd: "# Current",
      persistedLocale: "en",
      persistedVersion: 3,
      persistedUpdatedAt: "2026-07-24T12:00:00.000Z",
      hasStructuredSnapshot: false,
      counterpartContentMd: "# المحتوى الحالي",
      fetcher: async (url, init) => {
        calls.push({
          url: String(url),
          method: init?.method ?? "GET",
        });
        return jsonResponse(
          String(url).endsWith("/submit")
            ? { proposal: { status: "REVIEW" } }
            : { metadata: { evidenceStatus: "USER_ENTERED_UNVERIFIED" } },
          String(url).endsWith("/snapshot") ? 201 : 200
        );
      },
    });

    expect(result).toMatchObject({ proposal: { status: "REVIEW" } });
    expect(calls).toEqual([
      {
        url: "/api/proposals/proposal-1/snapshot",
        method: "POST",
      },
      {
        url: "/api/proposals/proposal-1/submit",
        method: "POST",
      },
    ]);
  });

  test("saves dirty content before hydration and submission", async () => {
    const calls: string[] = [];
    let saveBody: Record<string, unknown> | null = null;
    await submitProposalWithStructuredSnapshot({
      proposalId: "proposal-1",
      currentContentMd: "# Edited",
      currentLocale: "ar",
      persistedContentMd: "# Old",
      persistedLocale: "en",
      persistedVersion: 3,
      persistedUpdatedAt: "2026-07-24T12:00:00.000Z",
      hasStructuredSnapshot: true,
      counterpartContentMd: "# المحتوى المعدل",
      fetcher: async (url, init) => {
        calls.push(String(url));
        if (String(url) === "/api/proposals/proposal-1") {
          saveBody = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
        }
        return jsonResponse({});
      },
    });

    expect(calls).toEqual([
      "/api/proposals/proposal-1",
      "/api/proposals/proposal-1/snapshot",
      "/api/proposals/proposal-1/submit",
    ]);
    expect(saveBody).toMatchObject({
      expectedVersion: 3,
      expectedUpdatedAt: "2026-07-24T12:00:00.000Z",
    });
  });

  test("preserves an existing explicit snapshot and stops on hydration failure", async () => {
    const explicitCalls: string[] = [];
    await submitProposalWithStructuredSnapshot({
      proposalId: "proposal-1",
      currentContentMd: "# Current",
      currentLocale: "en",
      persistedContentMd: "# Current",
      persistedLocale: "en",
      persistedVersion: 3,
      persistedUpdatedAt: "2026-07-24T12:00:00.000Z",
      hasStructuredSnapshot: true,
      fetcher: async (url) => {
        explicitCalls.push(String(url));
        return jsonResponse({});
      },
    });
    expect(explicitCalls).toEqual([
      "/api/proposals/proposal-1/submit",
    ]);

    const failedCalls: string[] = [];
    await expect(
      submitProposalWithStructuredSnapshot({
        proposalId: "proposal-2",
        currentContentMd: "# Current",
        currentLocale: "en",
        persistedContentMd: "# Current",
        persistedLocale: "en",
        persistedVersion: 3,
        persistedUpdatedAt: "2026-07-24T12:00:00.000Z",
        hasStructuredSnapshot: false,
        counterpartContentMd: "# المحتوى الحالي",
        fetcher: async (url) => {
          failedCalls.push(String(url));
          return jsonResponse(
            { error: "Unsafe structured content" },
            422
          );
        },
      })
    ).rejects.toThrow("Unsafe structured content");
    expect(failedCalls).toEqual([
      "/api/proposals/proposal-2/snapshot",
    ]);
  });
});
