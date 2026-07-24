import { describe, expect, test } from "bun:test";
import {
  MAX_DOCUMENT_VERSION_BYTES,
  verifyDocumentVersionBytes,
} from "../document-version-integrity";

describe("document version byte integrity", () => {
  test("derives the checksum from actual stored bytes", () => {
    expect(
      verifyDocumentVersionBytes(Buffer.from("abc"), 3)
    ).toEqual({
      sizeBytes: 3,
      checksum:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });

  test("rejects claimed-size drift and invalid bounds", () => {
    expect(() =>
      verifyDocumentVersionBytes(Buffer.from("abc"), 2)
    ).toThrow("does not match");
    expect(() =>
      verifyDocumentVersionBytes(new Uint8Array(), 0)
    ).toThrow();
    expect(() =>
      verifyDocumentVersionBytes(
        Uint8Array.of(1),
        MAX_DOCUMENT_VERSION_BYTES + 1
      )
    ).toThrow();
  });
});
