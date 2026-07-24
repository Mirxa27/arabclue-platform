import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  handleContractTemplatePreview,
  type ContractTemplatePreviewDependencies,
} from "../../app/api/contracts/templates/[key]/preview/route";
import {
  compileContractTemplateDocument,
  renderContractTemplateDocumentHTML,
} from "../document-templates/contract-template-renderer";

function request(
  format: "html" | "pdf",
  body: unknown = { mode: "PREVIEW", bindings: {} }
): NextRequest {
  return new NextRequest(
    `http://localhost/api/contracts/templates/nda-v1/preview?format=${format}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function harness(): {
  dependencies: ContractTemplatePreviewDependencies;
  state: { pdfCalls: number; audits: number; releases: number };
} {
  const state = { pdfCalls: 0, audits: 0, releases: 0 };
  return {
    state,
    dependencies: {
      getSession: async () => ({ userId: "user-route" }),
      getWorkspace: async () => ({ id: "workspace-route" }),
      compile: (key, bindings, mode) =>
        compileContractTemplateDocument(key, bindings, { mode }),
      renderHtml: renderContractTemplateDocumentHTML,
      renderPdf: async () => {
        state.pdfCalls += 1;
        return Buffer.from("%PDF-template");
      },
      acquirePdfPermit: async () => ({
        ok: true,
        permit: {
          release: () => {
            state.releases += 1;
          },
        },
      }),
      recordPreview: async () => {
        state.audits += 1;
      },
    },
  };
}

describe("contract template preview route", () => {
  test("authenticates before compiling", async () => {
    const { dependencies } = harness();
    let compileCalls = 0;
    const response = await handleContractTemplatePreview(
      request("html"),
      "nda-v1",
      {
        ...dependencies,
        getSession: async () => null,
        compile: (...args) => {
          compileCalls += 1;
          return dependencies.compile(...args);
        },
      }
    );

    expect(response.status).toBe(401);
    expect(compileCalls).toBe(0);
  });

  test("renders a visible unreviewed HTML draft with immutable safety headers", async () => {
    const { dependencies, state } = harness();
    const response = await handleContractTemplatePreview(
      request("html"),
      "nda-v1",
      dependencies
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-contract-lifecycle")).toBe("DRAFT");
    expect(response.headers.get("x-legal-review-status")).toBe("UNREVIEWED");
    expect(response.headers.get("x-contract-executable")).toBe("false");
    expect(html).toContain("UNREVIEWED");
    expect(html).toContain("غير مراجع");
    expect(state.pdfCalls).toBe(0);
    expect(state.audits).toBe(1);
  });

  test("blocks FINAL output with unresolved required variables", async () => {
    const { dependencies, state } = harness();
    const response = await handleContractTemplatePreview(
      request("html", { mode: "FINAL", bindings: {} }),
      "nda-v1",
      dependencies
    );
    const body = (await response.json()) as {
      code: string;
      diagnostics: Array<{ severity: string }>;
    };

    expect(response.status).toBe(422);
    expect(body.code).toBe("CONTRACT_TEMPLATE_BLOCKED");
    expect(body.diagnostics.some((item) => item.severity === "ERROR")).toBe(
      true
    );
    expect(state.audits).toBe(0);
  });

  test("returns rate-limit denial without starting a PDF render", async () => {
    const { dependencies, state } = harness();
    const response = await handleContractTemplatePreview(
      request("pdf"),
      "nda-v1",
      {
        ...dependencies,
        acquirePdfPermit: async () => ({
          ok: false,
          code: "EXPORT_RATE_LIMITED",
          status: 429,
          retryAfterSeconds: 9,
          message: "Document export rate limit exceeded. Try again later.",
        }),
      }
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("9");
    expect(state.pdfCalls).toBe(0);
    expect(state.releases).toBe(0);
  });

  test("releases the render slot after a PDF response", async () => {
    const { dependencies, state } = harness();
    const response = await handleContractTemplatePreview(
      request("pdf"),
      "nda-v1",
      dependencies
    );

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(
      "%PDF-template"
    );
    expect(state.pdfCalls).toBe(1);
    expect(state.releases).toBe(1);
  });

  test("rejects unknown request fields and unknown templates", async () => {
    const { dependencies } = harness();
    const invalid = await handleContractTemplatePreview(
      request("html", { bindings: {}, injected: true }),
      "nda-v1",
      dependencies
    );
    expect(invalid.status).toBe(400);

    const unknown = await handleContractTemplatePreview(
      request("html"),
      "not-a-template",
      dependencies
    );
    expect(unknown.status).toBe(422);
  });
});

