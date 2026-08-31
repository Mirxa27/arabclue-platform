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
    expect(editor).toContain('exportMutation.mutate("docx")');
    // Anti-vacuous: the PDF action this sits beside is still wired.
    expect(editor).toContain('exportMutation.mutate("pdf")');
  });

  test("the button reports its own busy state", () => {
    // A shared spinner would make every export look like the Word one.
    expect(editor).toContain('busyFormat === "docx"');
  });

  test("a download with no server filename still lands as .docx", () => {
    expect(editor).toContain('"Technical_Proposal.docx"');
    expect(editor).toContain('"Technical_Proposal.pdf"');
  });

  test("the control is labelled for what it produces", () => {
    expect(editor).toContain("Word");
  });

  test("Word is withdrawn once the proposal stops being editable", () => {
    // An APPROVED or EXPORTED proposal exports through the structured snapshot,
    // which has no Word channel, so the route answers 409. Offering the button
    // anyway would hand the user an English-only error for a document that is
    // meant to be authoritative as a PDF, not editable in Word.
    expect(editor).toContain('status !== "APPROVED" && status !== "EXPORTED"');
    // Anti-vacuous: PDF stays available at every status.
    const pdf = /onClick=\{\(\) => exportMutation\.mutate\("pdf"\)\}/.exec(
      editor
    );
    expect(pdf, "pdf action not found").toBeTruthy();
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
