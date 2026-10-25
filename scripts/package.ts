import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";
import { BROWSER_TARGETS, buildAll, readPackageVersion } from "./build.ts";
import { crc32 } from "./generate-icons.ts";

const ROOT_DIR = process.cwd();
const DIST_ROOT = join(ROOT_DIR, "dist");
const RELEASE_ROOT = join(ROOT_DIR, "release");

const SOURCE_ARCHIVE_PATHS = [
  "src",
  "scripts",
  "tests",
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "vitest.config.ts",
  "README.md",
  "LICENSE",
] as const;

interface ZipEntryInput {
  relativePath: string;
  data: Uint8Array;
}

function collectFilesRecursive(dir: string, baseDir = dir): ZipEntryInput[] {
  const entries: ZipEntryInput[] = [];
  const items = readdirSync(dir).sort();

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      entries.push(...collectFilesRecursive(fullPath, baseDir));
    } else if (stat.isFile()) {
      const relativePath = relative(baseDir, fullPath).replace(/\\/g, "/");
      const data = new Uint8Array(readFileSync(fullPath));
      entries.push({ relativePath, data });
    }
  }

  return entries;
}

function collectSourceFiles(rootDir = ROOT_DIR): ZipEntryInput[] {
  const entries: ZipEntryInput[] = [];

  for (const item of SOURCE_ARCHIVE_PATHS) {
    const fullPath = join(rootDir, item);
    if (!existsSync(fullPath)) {
      continue;
    }
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      entries.push(...collectFilesRecursive(fullPath, rootDir));
    } else if (stat.isFile()) {
      entries.push({
        relativePath: item,
        data: new Uint8Array(readFileSync(fullPath)),
      });
    }
  }

  return entries;
}

/**
 * Creates a standards-compliant ZIP archive buffer from a list of files using DEFLATE.
 */
export function createZipBuffer(files: readonly ZipEntryInput[]): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.relativePath);
    const compressed = new Uint8Array(deflateRawSync(file.data));
    const crc = crc32(file.data);

    // Local file header (30 bytes + filename + compressed data)
    const localHeader = new Uint8Array(30 + nameBytes.length + compressed.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true); // Local file header signature
    localView.setUint16(4, 20, true); // Version needed to extract (2.0)
    localView.setUint16(6, 0, true); // General purpose bit flag
    localView.setUint16(8, 8, true); // Compression method: 8 (DEFLATE)
    localView.setUint16(10, 0, true); // Last mod file time
    localView.setUint16(12, 0x5421, true); // Last mod file date
    localView.setUint32(14, crc, true); // CRC-32
    localView.setUint32(18, compressed.length, true); // Compressed size
    localView.setUint32(22, file.data.length, true); // Uncompressed size
    localView.setUint16(26, nameBytes.length, true); // File name length
    localView.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);
    localHeader.set(compressed, 30 + nameBytes.length);

    // Central directory file header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true); // Central directory signature
    centralView.setUint16(4, 20, true); // Version made by
    centralView.setUint16(6, 20, true); // Version needed to extract
    centralView.setUint16(8, 0, true); // General purpose bit flag
    centralView.setUint16(10, 8, true); // Compression method: DEFLATE
    centralView.setUint16(12, 0, true); // Last mod file time
    centralView.setUint16(14, 0x5421, true); // Last mod file date
    centralView.setUint32(16, crc, true); // CRC-32
    centralView.setUint32(20, compressed.length, true); // Compressed size
    centralView.setUint32(24, file.data.length, true); // Uncompressed size
    centralView.setUint16(28, nameBytes.length, true); // File name length
    centralView.setUint16(30, 0, true); // Extra field length
    centralView.setUint16(32, 0, true); // File comment length
    centralView.setUint16(34, 0, true); // Disk number start
    centralView.setUint16(36, 0, true); // Internal file attributes
    centralView.setUint32(38, 0, true); // External file attributes
    centralView.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    localHeaders.push(localHeader);
    centralHeaders.push(centralHeader);
    offset += localHeader.length;
  }

  const centralDirSize = centralHeaders.reduce((acc, h) => acc + h.length, 0);
  const centralDirOffset = offset;

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // Number of this disk
  eocdView.setUint16(6, 0, true); // Disk where central directory starts
  eocdView.setUint16(8, files.length, true); // Total entries on this disk
  eocdView.setUint16(10, files.length, true); // Total entries in central directory
  eocdView.setUint32(12, centralDirSize, true); // Size of central directory
  eocdView.setUint32(16, centralDirOffset, true); // Offset of central directory
  eocdView.setUint16(20, 0, true); // Comment length

  const totalSize = offset + centralDirSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let pos = 0;

  for (const lh of localHeaders) {
    output.set(lh, pos);
    pos += lh.length;
  }
  for (const ch of centralHeaders) {
    output.set(ch, pos);
    pos += ch.length;
  }
  output.set(eocd, pos);

  return output;
}

export async function packageAll(
  distRoot = DIST_ROOT,
  releaseRoot = RELEASE_ROOT
): Promise<string[]> {
  await buildAll(distRoot);
  rmSync(releaseRoot, { recursive: true, force: true });
  mkdirSync(releaseRoot, { recursive: true });

  const version = readPackageVersion(ROOT_DIR);

  const createdArchives: string[] = [];

  for (const target of BROWSER_TARGETS) {
    const targetDist = join(distRoot, target);
    const files = collectFilesRecursive(targetDist);
    const zipBuffer = createZipBuffer(files);
    const zipPath = join(
      releaseRoot,
      `ao3-a11y-helper-${target}-v${version}.zip`
    );
    writeFileSync(zipPath, zipBuffer);
    createdArchives.push(zipPath);
  }

  // Also create a clean source code archive required by Mozilla Add-ons (AMO) review
  const sourceFiles = collectSourceFiles(ROOT_DIR);
  const sourceZipBuffer = createZipBuffer(sourceFiles);
  const sourceZipPath = join(
    releaseRoot,
    `ao3-a11y-helper-source-v${version}.zip`
  );
  writeFileSync(sourceZipPath, sourceZipBuffer);
  createdArchives.push(sourceZipPath);

  return createdArchives;
}

if (import.meta.main) {
  const archives = await packageAll();
  for (const archive of archives) {
    console.log(`Packaged store archive: ${archive}`);
  }
}
