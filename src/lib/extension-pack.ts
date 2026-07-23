import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "fs";
import path from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";

type ZipEntry = { name: string; data: Buffer };

function walk(dir: string, root: string, out: ZipEntry[]) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".DS_Store" || entry === "node_modules") continue;
    const full = path.join(dir, entry);
    const rel = path.relative(root, full).split(path.sep).join("/");
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, root, out);
    } else {
      out.push({ name: rel, data: readFileSync(full) });
    }
  }
}

/** CRC32 for ZIP local/central headers */
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function u16(n: number) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}
function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

/**
 * Build a store-only (no compression) ZIP buffer — compatible with Chrome Load unpacked after unzip.
 */
export function buildStoreZip(entries: ZipEntry[], rootPrefix = "arabclue-agent"): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = `${rootPrefix}/${entry.name}`.replace(/\\/g, "/");
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0), // store
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      entry.data,
    ]);

    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...locals, centralDir, end]);
}

export const EXTENSION_ZIP_FILENAME = "arabclue-voice-agent.zip";
/** Path under `public/` for the pre-packed download artifact. */
export const EXTENSION_ZIP_RELATIVE = `downloads/${EXTENSION_ZIP_FILENAME}`;

export function getExtensionSourceDir() {
  return path.join(process.cwd(), "extensions", "arabclue-agent");
}

export async function packExtensionZipToBuffer(): Promise<Buffer> {
  const root = getExtensionSourceDir();
  if (!existsSync(root)) {
    throw new Error("Extension source missing: extensions/arabclue-agent");
  }
  const entries: ZipEntry[] = [];
  walk(root, root, entries);
  if (!entries.length) throw new Error("Extension folder is empty");
  return buildStoreZip(entries, "arabclue-agent");
}

export async function packExtensionZipToPublic(): Promise<string> {
  const buf = await packExtensionZipToBuffer();
  const outDir = path.join(process.cwd(), "public", "downloads");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, EXTENSION_ZIP_FILENAME);
  const ws = createWriteStream(outPath);
  Readable.from(buf).pipe(ws);
  await finished(ws);
  return outPath;
}
