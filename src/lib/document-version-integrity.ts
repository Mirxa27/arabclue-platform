import { createHash } from "crypto";

export const MAX_DOCUMENT_VERSION_BYTES = 100 * 1024 * 1024;

export type VerifiedDocumentVersionBytes = {
  readonly sizeBytes: number;
  readonly checksum: string;
};

/**
 * Verify stored bytes against a client's declared size and derive the only
 * checksum that may be persisted for a document version.
 */
export function verifyDocumentVersionBytes(
  bytes: Uint8Array,
  declaredSizeBytes: number
): VerifiedDocumentVersionBytes {
  if (
    !Number.isSafeInteger(declaredSizeBytes) ||
    declaredSizeBytes < 1 ||
    declaredSizeBytes > MAX_DOCUMENT_VERSION_BYTES
  ) {
    throw new Error("Invalid declared document version size");
  }
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > MAX_DOCUMENT_VERSION_BYTES
  ) {
    throw new Error("Stored document version size is outside allowed limits");
  }
  if (bytes.byteLength !== declaredSizeBytes) {
    throw new Error("Declared version size does not match stored bytes");
  }
  return {
    sizeBytes: bytes.byteLength,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}
