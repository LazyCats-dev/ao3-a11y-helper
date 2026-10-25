import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import {
  BROWSER_TARGETS,
  buildAll,
  readPackageVersion,
} from "../scripts/build.ts";
import { crc32, renderIconPng } from "../scripts/generate-icons.ts";
import { packageAll } from "../scripts/package.ts";
import { createManifest } from "../src/manifests/manifest.base.ts";

/**
 * Parses a ZIP buffer via its End of Central Directory (EOCD) and Central Directory,
 * decompresses every entry with `inflateRawSync`, and verifies CRC-32 and byte lengths.
 */
function verifyAndExtractZip(zipBytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength
  );

  // Locate End of Central Directory (EOCD) record (22 bytes at end of archive)
  const eocdOffset = zipBytes.byteLength - 22;
  expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const extracted = new Map<string, Uint8Array>();
  let cdCursor = centralDirOffset;
  const decoder = new TextDecoder();

  for (let i = 0; i < entryCount; i++) {
    expect(view.getUint32(cdCursor, true)).toBe(0x02014b50);
    const compressionMethod = view.getUint16(cdCursor + 10, true);
    const expectedCrc = view.getUint32(cdCursor + 16, true);
    const compressedSize = view.getUint32(cdCursor + 20, true);
    const uncompressedSize = view.getUint32(cdCursor + 24, true);
    const fileNameLen = view.getUint16(cdCursor + 28, true);
    const extraLen = view.getUint16(cdCursor + 30, true);
    const commentLen = view.getUint16(cdCursor + 32, true);
    const localHeaderOffset = view.getUint32(cdCursor + 42, true);

    const fileName = decoder.decode(
      zipBytes.subarray(cdCursor + 46, cdCursor + 46 + fileNameLen)
    );

    // Verify corresponding Local File Header
    expect(view.getUint32(localHeaderOffset, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    expect(localNameLen).toBe(fileNameLen);

    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedSlice = zipBytes.subarray(
      dataStart,
      dataStart + compressedSize
    );

    expect(compressionMethod).toBe(8); // DEFLATE
    const decompressed = new Uint8Array(inflateRawSync(compressedSlice));
    expect(decompressed.byteLength).toBe(uncompressedSize);
    expect(crc32(decompressed)).toBe(expectedCrc);

    extracted.set(fileName, decompressed);
    cdCursor += 46 + fileNameLen + extraLen + commentLen;
  }

  expect(cdCursor).toBe(eocdOffset);
  return extracted;
}

describe("extension icons, manifests, and build pipeline", () => {
  test("renderIconPng generates valid PNG files with exact IHDR pixel dimensions", () => {
    for (const size of [16, 48, 128]) {
      const png = renderIconPng(size);
      // Verify PNG magic signature
      expect(Array.from(png.subarray(0, 8))).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10,
      ]);
      // Verify IHDR width and height match `size`
      const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      expect(width).toBe(size);
      expect(height).toBe(size);
    }
  });

  test("createManifest and readPackageVersion validate MAJOR.MINOR.PATCH versions and produce valid MV3 manifests", () => {
    const chromeManifest = createManifest("chrome", "1.0.0");
    expect(chromeManifest.manifest_version).toBe(3);
    expect(chromeManifest.browser_specific_settings).toBeUndefined();
    expect(chromeManifest.content_scripts[0]?.matches).toContain(
      "https://archiveofourown.org/works/new*"
    );

    const edgeManifest = createManifest("edge", "1.0.0");
    expect(edgeManifest.manifest_version).toBe(3);
    expect(edgeManifest.browser_specific_settings).toBeUndefined();

    const firefoxManifest = createManifest("firefox", "1.0.0");
    expect(firefoxManifest.manifest_version).toBe(3);
    expect(firefoxManifest.browser_specific_settings?.gecko.id).toBe(
      "ao3-a11y-helper@archiveofourown.org"
    );
    expect(
      firefoxManifest.browser_specific_settings?.gecko.strict_min_version
    ).toBe("109.0");
    expect(
      firefoxManifest.browser_specific_settings?.gecko_android
        .strict_min_version
    ).toBe("120.0");

    expect(() => createManifest("chrome", "1.0.0-beta.1")).toThrow(
      /MAJOR\.MINOR\.PATCH/
    );
    expect(() => createManifest("chrome", "01.0.0")).toThrow(
      /MAJOR\.MINOR\.PATCH/
    );
    expect(() => createManifest("chrome", "1.0")).toThrow(
      /MAJOR\.MINOR\.PATCH/
    );

    // Validate readPackageVersion against malformed package.json files
    const tempPkgDir = mkdtempSync(join(tmpdir(), "ao3-a11y-pkg-"));
    try {
      writeFileSync(join(tempPkgDir, "package.json"), JSON.stringify({}), "utf8");
      expect(() => readPackageVersion(tempPkgDir)).toThrow(
        /Missing string "version"/
      );

      writeFileSync(
        join(tempPkgDir, "package.json"),
        JSON.stringify({ version: "1.0.0-alpha" }),
        "utf8"
      );
      expect(() => readPackageVersion(tempPkgDir)).toThrow(
        /Expected MAJOR\.MINOR\.PATCH/
      );
    } finally {
      rmSync(tempPkgDir, { recursive: true, force: true });
    }
  });

  test("buildAll and packageAll produce valid, decompressible ZIP archives with intact manifests, bundles, and source files", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "ao3-a11y-build-"));
    const distDir = join(tempRoot, "dist");
    const releaseDir = join(tempRoot, "release");

    try {
      const targetDirs = await buildAll(distDir);
      expect(targetDirs).toHaveLength(3);

      for (const target of BROWSER_TARGETS) {
        const dir = join(distDir, target);
        expect(existsSync(join(dir, "manifest.json"))).toBe(true);
        expect(existsSync(join(dir, "content", "index.js"))).toBe(true);
        expect(existsSync(join(dir, "content", "styles.css"))).toBe(true);
        expect(existsSync(join(dir, "icons", "icon-16.png"))).toBe(true);
        expect(existsSync(join(dir, "icons", "icon-48.png"))).toBe(true);
        expect(existsSync(join(dir, "icons", "icon-128.png"))).toBe(true);
      }

      const archives = await packageAll(distDir, releaseDir);
      expect(archives).toHaveLength(4);

      const decoder = new TextDecoder();

      for (const target of BROWSER_TARGETS) {
        const archivePath = archives.find((p) => p.includes(`-${target}-`));
        expect(archivePath).toBeDefined();
        if (!archivePath) continue;

        const zipBytes = new Uint8Array(readFileSync(archivePath));
        const extracted = verifyAndExtractZip(zipBytes);

        expect(Array.from(extracted.keys()).sort()).toEqual([
          "content/index.js",
          "content/styles.css",
          "icons/icon-128.png",
          "icons/icon-16.png",
          "icons/icon-48.png",
          "manifest.json",
        ]);

        const manifestBytes = extracted.get("manifest.json");
        expect(manifestBytes).toBeDefined();
        const diskManifest = readFileSync(
          join(distDir, target, "manifest.json"),
          "utf8"
        );
        expect(decoder.decode(manifestBytes)).toBe(diskManifest);

        const bundleJs = decoder.decode(extracted.get("content/index.js"));
        expect(bundleJs).toContain("AO3 Accessibility Check");
      }

      const sourceArchivePath = archives.find((p) => p.includes("-source-"));
      expect(sourceArchivePath).toBeDefined();
      if (sourceArchivePath) {
        const sourceZipBytes = new Uint8Array(readFileSync(sourceArchivePath));
        const extractedSource = verifyAndExtractZip(sourceZipBytes);
        expect(extractedSource.has("package.json")).toBe(true);
        expect(extractedSource.has("README.md")).toBe(true);
        expect(extractedSource.has("src/linter/index.ts")).toBe(true);
        expect(extractedSource.has("src/content/warning-panel.ts")).toBe(true);
      }
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
