import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, readFile, access, lstat } from "fs/promises";
import path from "path";
import { get, head, put } from "@vercel/blob";

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const STORAGE_PREFIX = "uploads";

function isBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function getBaseUploadRoot(): string {
  if (process.env.VERCEL && !isBlobStorage()) {
    return path.join("/tmp", "uploads");
  }
  return path.join(process.cwd(), "uploads");
}

export function getUploadRoot(): string {
  return getBaseUploadRoot();
}

function assertSafeWorkspaceId(workspaceId: string): string {
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new Error("Invalid workspace storage scope");
  }
  return workspaceId;
}

/**
 * Canonicalize an application storage key.
 *
 * Only relative keys below `uploads/` are accepted. Filesystem paths, URLs,
 * data URIs, backslashes, NULs, query strings, fragments, repeated separators,
 * and traversal segments fail closed before local or Blob access.
 */
export function assertStoragePath(storagePath: string): string {
  if (
    !storagePath ||
    path.isAbsolute(storagePath) ||
    storagePath.includes("\\") ||
    storagePath.includes("\0") ||
    storagePath.includes("?") ||
    storagePath.includes("#") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(storagePath)
  ) {
    throw new Error("Invalid storage path");
  }

  const normalized = path.posix.normalize(storagePath);
  const segments = storagePath.split("/");
  if (
    normalized !== storagePath ||
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    segments[0] !== STORAGE_PREFIX ||
    segments.length < 3
  ) {
    throw new Error("Invalid storage path");
  }
  return normalized;
}

/** Require a canonical key under exactly `uploads/<workspaceId>/`. */
export function assertWorkspaceStoragePath(
  storagePath: string,
  workspaceId: string
): string {
  const safeWorkspaceId = assertSafeWorkspaceId(workspaceId);
  const canonical = assertStoragePath(storagePath);
  const prefix = `${STORAGE_PREFIX}/${safeWorkspaceId}/`;
  if (!canonical.startsWith(prefix)) {
    throw new Error("Storage path is outside the workspace");
  }
  return canonical;
}

export async function ensureUploadDir(workspaceId: string): Promise<string> {
  const dir = path.join(
    getBaseUploadRoot(),
    assertSafeWorkspaceId(workspaceId)
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF ]/g, "_").slice(0, 180);
}

export async function saveUpload(opts: {
  workspaceId: string;
  originalName: string;
  bytes: Buffer;
}): Promise<{ storagePath: string; absolutePath: string; checksum: string; sizeBytes: number }> {
  const workspaceId = assertSafeWorkspaceId(opts.workspaceId);
  const id = randomUUID().slice(0, 8);
  const safe = sanitizeFilename(opts.originalName);
  const filename = `${id}-${safe}`;
  const storagePath = assertWorkspaceStoragePath(
    path.posix.join(STORAGE_PREFIX, workspaceId, filename),
    workspaceId
  );
  const checksum = createHash("sha256").update(opts.bytes).digest("hex");

  if (isBlobStorage()) {
    await put(storagePath, opts.bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/octet-stream",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return {
      storagePath,
      absolutePath: storagePath,
      checksum,
      sizeBytes: opts.bytes.length,
    };
  }

  const dir = await ensureUploadDir(workspaceId);
  const absolutePath = path.join(dir, filename);
  await writeFile(absolutePath, opts.bytes);
  return {
    storagePath,
    absolutePath,
    checksum,
    sizeBytes: opts.bytes.length,
  };
}

export function resolveStoragePath(storagePath: string): string {
  const canonical = assertStoragePath(storagePath);
  const relative = canonical.slice(`${STORAGE_PREFIX}/`.length);
  const root = path.resolve(getBaseUploadRoot());
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Storage path escapes the upload root");
  }
  return resolved;
}

/** Resolve a local file only after workspace containment is proven. */
export function resolveWorkspaceStoragePath(
  storagePath: string,
  workspaceId: string
): string {
  const canonical = assertWorkspaceStoragePath(storagePath, workspaceId);
  const workspaceRoot = path.resolve(
    getBaseUploadRoot(),
    assertSafeWorkspaceId(workspaceId)
  );
  const relative = canonical.slice(
    `${STORAGE_PREFIX}/${workspaceId}/`.length
  );
  const resolved = path.resolve(workspaceRoot, relative);
  if (!resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error("Storage path escapes the workspace");
  }
  return resolved;
}

type ReadStoredFileOptions = {
  readonly maxBytes?: number;
};

function normalizedMaxBytes(maxBytes: number | undefined): number {
  if (maxBytes === undefined) return Number.POSITIVE_INFINITY;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }
  return maxBytes;
}

async function streamToBuffer(
  stream: ReadableStream<Uint8Array>,
  maxBytes?: number
): Promise<Buffer> {
  const byteLimit = normalizedMaxBytes(maxBytes);
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > byteLimit) {
        await reader.cancel("Stored file exceeds the read limit");
        throw new Error("Stored file exceeds the read limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function readLocalFile(
  absolutePath: string,
  options: ReadStoredFileOptions = {}
): Promise<Buffer> {
  const maxBytes = normalizedMaxBytes(options.maxBytes);
  const fileInfo = await lstat(absolutePath);
  if (!fileInfo.isFile() || fileInfo.size > maxBytes) {
    throw new Error("Stored file is missing or exceeds the read limit");
  }
  const bytes = await readFile(absolutePath);
  if (bytes.length > maxBytes) {
    throw new Error("Stored file exceeds the read limit");
  }
  return bytes;
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  const canonical = assertStoragePath(storagePath);
  if (isBlobStorage()) {
    const result = await get(canonical, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error("File not found");
    }
    return streamToBuffer(result.stream);
  }
  const abs = resolveStoragePath(canonical);
  return readLocalFile(abs);
}

export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    const canonical = assertStoragePath(storagePath);
    if (isBlobStorage()) {
      await head(canonical, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return true;
    }
    await access(resolveStoragePath(canonical));
    return true;
  } catch {
    return false;
  }
}

/** Read a file through the workspace-specific containment boundary. */
export async function readWorkspaceStoredFile(
  storagePath: string,
  workspaceId: string,
  options: ReadStoredFileOptions = {}
): Promise<Buffer> {
  const canonical = assertWorkspaceStoragePath(storagePath, workspaceId);
  if (isBlobStorage()) {
    const result = await get(canonical, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error("File not found");
    }
    return streamToBuffer(result.stream, options.maxBytes);
  }

  const absolutePath = resolveWorkspaceStoragePath(canonical, workspaceId);
  return readLocalFile(absolutePath, options);
}

export async function workspaceFileExists(
  storagePath: string,
  workspaceId: string
): Promise<boolean> {
  try {
    const canonical = assertWorkspaceStoragePath(storagePath, workspaceId);
    if (isBlobStorage()) {
      await head(canonical, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return true;
    }
    await access(resolveWorkspaceStoragePath(canonical, workspaceId));
    return true;
  } catch {
    return false;
  }
}
