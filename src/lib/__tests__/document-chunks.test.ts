import { describe, expect, test } from "bun:test";
import { chunkText } from "../document-chunks";

describe("chunkText", () => {
  test("returns empty array for empty string", () => {
    expect(chunkText("")).toEqual([]);
  });

  test("returns empty array for whitespace-only string", () => {
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  test("returns single chunk when text fits within size", () => {
    const text = "short text";
    const chunks = chunkText(text, 100, 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("short text");
  });

  test("splits text into multiple chunks with overlap", () => {
    const text = "a".repeat(200);
    const chunks = chunkText(text, 50, 10);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk (except possibly last) should be <= size
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(50);
    }
  });

  test("overlap creates shared content between consecutive chunks", () => {
    const text = "abcdefghijklmnopqrstuvwxyz".repeat(20); // 520 chars
    const size = 100;
    const overlap = 20;
    const chunks = chunkText(text, size, overlap);
    expect(chunks.length).toBeGreaterThan(1);
    // The overlap region should appear at end of chunk[i] and start of chunk[i+1]
    const tail = chunks[0].slice(-overlap);
    const head = chunks[1].slice(0, overlap);
    expect(tail).toBe(head);
  });

  test("normalizes whitespace in input", () => {
    const chunks = chunkText("hello\n\n  world\t\ttab", 100, 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("hello world tab");
  });

  test("respects MAX_CHUNKS_PER_DOC limit of 40", () => {
    const text = "a".repeat(100000);
    const chunks = chunkText(text, 100, 10);
    expect(chunks.length).toBeLessThanOrEqual(40);
  });

  test("skips chunks shorter than 40 chars", () => {
    const text = "a".repeat(50);
    const chunks = chunkText(text, 100, 10);
    // 50 chars fits in one chunk, which is > 40
    expect(chunks).toHaveLength(1);
  });

  test("uses default size and overlap when not specified", () => {
    const text = "word ".repeat(300); // ~1500 chars
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(900);
    }
  });

  test("handles text exactly at chunk boundary", () => {
    const text = "a".repeat(50);
    const chunks = chunkText(text, 50, 10);
    expect(chunks).toHaveLength(1);
  });
});
