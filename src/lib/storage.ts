import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, readFile, access } from "fs/promises";
import path from "path";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export function getUploadRoot(): string {
  return UPLOAD_ROOT;
}

export async function ensureUploadDir(workspaceId: string): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, workspaceId);
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
  const dir = await ensureUploadDir(opts.workspaceId);
  const id = randomUUID().slice(0, 8);
  const safe = sanitizeFilename(opts.originalName);
  const filename = `${id}-${safe}`;
  const absolutePath = path.join(dir, filename);
  await writeFile(absolutePath, opts.bytes);
  const checksum = createHash("sha256").update(opts.bytes).digest("hex");
  // Relative path stored in DB (portable across deploys)
  const storagePath = path.join("uploads", opts.workspaceId, filename);
  return {
    storagePath,
    absolutePath,
    checksum,
    sizeBytes: opts.bytes.length,
  };
}

export function resolveStoragePath(storagePath: string): string {
  if (path.isAbsolute(storagePath)) return storagePath;
  return path.join(process.cwd(), storagePath);
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  const abs = resolveStoragePath(storagePath);
  await access(abs);
  return readFile(abs);
}

export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    await access(resolveStoragePath(storagePath));
    return true;
  } catch {
    return false;
  }
}
