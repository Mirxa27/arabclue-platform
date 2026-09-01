/**
 * Word has to be reachable, not just implemented.
 *
 * The route renders .docx and the schema accepts it, but a format with no
 * control in the studio is a capability nobody can use. These are the two
 * surfaces that own a download today: the proposal studio header and the
 * contract panel's export row.
 *
 * Asserted against source because these are React trees with no test renderer
 * in this repo. Each check pairs with a PDF assertion so a rename cannot turn
 * the suite silently green.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const editor = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/proposal-editor.tsx"),
  "utf8"
);
const contracts = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/contracts-panel.tsx"),
  "utf8"
);

describe("proposal studio offers a Word download", () => {
  test("the export mutation is invoked with docx", () => {
    // The three copy-pasted buttons collapsed into one Download menu, so the
    // format is a loop variable now rather than a literal per button. What
    // still has to hold is that docx is one of the formats the menu can render.
    expect(editor).toContain("exportMutation.mutate(format)");
    expect(editor).toContain("DOWNLOAD_FORMAT_ICONS");
    const icons = /const DOWNLOAD_FORMAT_ICONS = \{[^}]*\}/.exec(editor)?.[0];
    expect(icons, "DOWNLOAD_FORMAT_ICONS not found").toBeTruthy();
    expect(icons).toContain("docx");
    // Anti-vacuous: the PDF action this sits beside is still offered.
    expect(icons).toContain("pdf");
  });

  test("the button reports its own busy state", () => {
    // A shared spinner would make every export look like the Word one, so the
    // menu row for the format being fetched is the one that spins.
    expect(editor).toContain("busyFormat === format");
  });

  test("a download with no server filename still lands as .docx", () => {
    expect(editor).toContain('"Technical_Proposal.docx"');
    expect(editor).toContain('"Technical_Proposal.pdf"');
  });

  test("the control is labelled for what it produces", () => {
    expect(editor).toContain("Word");
  });

  test("Word is withdrawn exactly when the route would refuse it", () => {
    // This used to read `status !== "APPROVED" && status !== "EXPORTED"`, which
    // was wrong: the route refuses docx whenever a *structured snapshot* exists,
    // and a DRAFT gets one as soon as it is generated. So the button was offered
    // on proposals answered with a 409. The list is now computed server side by
    // `offerableProposalDownloadFormats`, from the same selector `/download`
    // enforces with — see proposal-snapshot-persistence.test.ts for that rule.
    expect(editor).toContain("validationData?.downloadFormats");
    // The defect was a status guess. Assert it has not crept back.
    expect(editor).not.toContain('status !== "APPROVED"');
    expect(editor).not.toContain('status !== "EXPORTED"');
    // Anti-vacuous: `status` is still read for other purposes, so the two
    // negative checks above are not passing merely because it went away.
    expect(editor).toContain("const status = data?.proposal?.status");
  });
});

describe("contract panel offers a Word download", () => {
  test("the download helper accepts docx", () => {
    const signature = /format: "html" \| "pdf"[^;\n]*/.exec(contracts)?.[0];
    expect(signature, "downloadContract format union not found").toBeTruthy();
    expect(signature).toContain('"docx"');
  });

  test("the button requests docx with a Word fallback name", () => {
    expect(contracts).toContain('"docx"');
    expect(contracts).toContain('"Draft_Contract.docx"');
  });

  test("Word is gated on export readiness like the PDF is", () => {
    // A contract that has not cleared the approval workflow must not leave the
    // building as an editable file either.
    expect(contracts).toContain('busyFormat === "docx" || exportBlocked');
    expect(contracts).toContain('busyFormat === "pdf" || exportBlocked');
  });
});
