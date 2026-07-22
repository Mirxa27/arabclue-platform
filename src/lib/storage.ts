import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, readFile, access } from "fs/promises";
import path from "path";
import { get, head, put } from "@vercel/blob";

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

export async function ensureUploadDir(workspaceId: string): Promise<string> {
  const dir = path.join(getBaseUploadRoot(), workspaceId);
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
  const id = randomUUID().slice(0, 8);
  const safe = sanitizeFilename(opts.originalName);
  const filename = `${id}-${safe}`;
  const storagePath = path.posix.join("uploads", opts.workspaceId, filename);
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

  const dir = await ensureUploadDir(opts.workspaceId);
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
  if (path.isAbsolute(storagePath)) return storagePath;
  if (storagePath.startsWith("uploads/")) {
    if (process.env.VERCEL && !isBlobStorage()) {
      return path.join("/tmp", storagePath);
    }
    return path.join(process.cwd(), storagePath);
  }
  return path.join(process.cwd(), storagePath);
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const ab = await new Response(stream).arrayBuffer();
  return Buffer.from(ab);
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  if (isBlobStorage()) {
    const result = await get(storagePath, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error("File not found");
    }
    return streamToBuffer(result.stream);
  }
  const abs = resolveStoragePath(storagePath);
  await access(abs);
  return readFile(abs);
}

export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    if (isBlobStorage()) {
      await head(storagePath, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return true;
    }
    await access(resolveStoragePath(storagePath));
    return true;
  } catch {
    return false;
  }
}
