/**
 * Word as a governed deliverable.
 *
 * A .docx is the file a procurement officer edits and sends back, so it is a
 * final artifact in exactly the sense the PDF is — not a preview like `slides`
 * and not a legacy sheet like `xlsx-boq`. Every gate the route applies to `pdf`
 * has to apply to `docx`, or Word becomes the format that walks past the
 * concurrency limiter, the approval allowlist and the lifecycle rules.
 *
 * The gate placement is asserted against the route source because the gates are
 * inline branches in a 1300-line handler that needs a session, a tenant and a
 * database to reach. Structure is what can be checked here; the renderer's own
 * bytes are covered by markdown-docx.test.ts.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { selectProposalDownloadEngine } from "../proposal-snapshot-persistence";
import { resolveProposalDownloadFormat } from "../../app/api/proposals/[id]/download/route";

const ROUTE = readFileSync(
  "src/app/api/proposals/[id]/download/route.ts",
  "utf8"
);

describe("docx format resolution", () => {
  test("the route accepts docx", () => {
    expect(resolveProposalDownloadFormat("docx")).toBe("docx");
  });

  test("near-miss Word extensions are still rejected", () => {
    expect(resolveProposalDownloadFormat("doc")).toBeNull();
    expect(resolveProposalDownloadFormat("docm")).toBeNull();
    expect(resolveProposalDownloadFormat("DOCX")).toBeNull();
  });

  test("the unsupported-format message lists docx", () => {
    // The message is the only thing a caller with a bad URL sees.
    const message = /Unsupported format\. Expected ([^"]+)/.exec(ROUTE)?.[1];
    expect(message, "unsupported-format message not found").toBeTruthy();
    expect(message).toContain("docx");
  });
});

describe("docx is refused where markdown would be stale", () => {
  test("a structured snapshot rejects docx rather than exporting contentMd", () => {
    // The snapshot is authoritative. Rendering the legacy markdown body to Word
    // behind it would hand out a document the approval chain never saw.
    expect(selectProposalDownloadEngine(true, "docx")).toEqual({
      kind: "STRUCTURED_FORMAT_UNSUPPORTED",
    });
  });

  test("without a snapshot docx uses the legacy markdown engine", () => {
    expect(selectProposalDownloadEngine(false, "docx")).toEqual({
      kind: "LEGACY",
    });
  });

  test("the channels that do have a structured renderer still resolve", () => {
    // Anti-vacuous: a selector that returned UNSUPPORTED for everything would
    // pass the assertion above.
    expect(selectProposalDownloadEngine(true, "pdf")).toEqual({
      kind: "STRUCTURED",
      channel: "PDF",
    });
    expect(selectProposalDownloadEngine(true, "zip")).toEqual({
      kind: "STRUCTURED_SUPPLEMENTAL",
    });
  });
});

describe("docx is gated like the PDF, not like a preview", () => {
  test("it passes through the document export concurrency gate", () => {
    const branch = /let exportPermit[\s\S]{0,400}?const sourceCharacters/.exec(
      ROUTE
    )?.[0];
    expect(branch, "export-gate branch not found").toBeTruthy();
    expect(branch).toContain('format === "docx"');
    // Anti-vacuous: this is the branch that also gates the PDF.
    expect(branch).toContain('format === "pdf"');
  });

  test("it counts as a final artifact for lifecycle purposes", () => {
    const line = /const finalArtifactRequested = isContract\n[\s\S]{0,400}?;\n/.exec(
      ROUTE
    )?.[0];
    expect(line, "finalArtifactRequested not found").toBeTruthy();
    expect(line).toContain('"docx"');
  });

  test("contracts may be exported to Word", () => {
    // Contracts fall back to pdf for any format they do not support; docx has
    // to be in the allowlist or a Word request silently returns a PDF.
    const allowlists = ROUTE.match(/\["html", "pdf",[^\]]*\]/g);
    expect(allowlists?.length, "contract allowlist not found").toBe(2);
    for (const list of allowlists!) {
      expect(list, `allowlist missing docx: ${list}`).toContain('"docx"');
    }
  });

  test("the response carries the OOXML word media type and a .docx name", () => {
    expect(ROUTE).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    // Both bodies the markdown path can carry get a Word name.
    expect(ROUTE).toContain('"Technical_Proposal.docx"');
    expect(ROUTE).toContain('"Draft_Contract.docx"');
  });
});
