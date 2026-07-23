import { describe, expect, test } from "bun:test";
import { hydrateUiMessages } from "@/lib/agents/platform/mission-transcript";
import { isImageMime } from "@/lib/agents/ocr-image";
import { chunkText } from "@/lib/document-chunks";
import { retrieveRelevant } from "@/lib/rag";
import { localEmbedText } from "@/lib/llm";

describe("mission transcript hydrate", () => {
  test("restores parts and ids from stored JSON", () => {
    const msgs = hydrateUiMessages([
      {
        id: "db1",
        role: "user",
        partsJson: JSON.stringify({
          id: "u1",
          parts: [{ type: "text", text: "hello" }],
        }),
      },
      {
        id: "db2",
        role: "assistant",
        partsJson: JSON.stringify({
          id: "a1",
          parts: [{ type: "text", text: "hi" }],
        }),
      },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].id).toBe("u1");
    expect(msgs[0].role).toBe("user");
    expect((msgs[0].parts[0] as { text: string }).text).toBe("hello");
    expect(msgs[1].role).toBe("assistant");
  });

  test("skips unknown roles", () => {
    const msgs = hydrateUiMessages([
      { id: "x", role: "tool", partsJson: '{"parts":[]}' },
    ]);
    expect(msgs).toHaveLength(0);
  });
});

describe("image OCR mime detection", () => {
  test("detects common image types", () => {
    expect(isImageMime("image/png", "a.png")).toBe(true);
    expect(isImageMime("image/jpeg", "scan.jpg")).toBe(true);
    expect(isImageMime("application/pdf", "a.pdf")).toBe(false);
  });
});

describe("document chunk search primitives", () => {
  test("chunkText overlaps windows", () => {
    const text = "word ".repeat(500);
    const chunks = chunkText(text, 100, 20);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("embedding retrieve ranks related content", () => {
    const docs = [
      {
        id: "1",
        title: "PDPL health",
        summary: "electronic health records PDPL Saudi privacy",
        embedding: localEmbedText("electronic health records PDPL Saudi privacy"),
      },
      {
        id: "2",
        title: "Roads",
        summary: "asphalt highway construction tender",
        embedding: localEmbedText("asphalt highway construction tender"),
      },
    ];
    const q = "PDPL health data";
    const hits = retrieveRelevant(q, docs, {
      topK: 1,
      queryEmbedding: localEmbedText(q),
    });
    expect(hits[0]?.id).toBe("1");
  });
});
