import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BrowserTarget,
  createManifest,
  EXTENSION_VERSION_PATTERN,
} from "../src/manifests/manifest.base.ts";
import { generateIcons } from "./generate-icons.ts";

const ROOT_DIR = process.cwd();
const DIST_ROOT = join(ROOT_DIR, "dist");
const ICONS_SRC_DIR = join(ROOT_DIR, "src", "icons");
const STYLES_SRC_PATH = join(ROOT_DIR, "src", "content", "styles.css");
const CONTENT_ENTRY_PATH = join(ROOT_DIR, "src", "content", "index.ts");

export const BROWSER_TARGETS: readonly BrowserTarget[] = [
  "chrome",
  "firefox",
  "edge",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readPackageVersion(rootDir = ROOT_DIR): string {
  const pkgPath = join(rootDir, "package.json");
  const parsed: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (!isRecord(parsed) || typeof parsed["version"] !== "string") {
    throw new Error(`Missing string "version" field in ${pkgPath}`);
  }
  const version = parsed["version"];
  if (!EXTENSION_VERSION_PATTERN.test(version)) {
    throw new Error(
      `Invalid extension version "${version}" in ${pkgPath}. Expected MAJOR.MINOR.PATCH.`
    );
  }
  return version;
}

export async function buildTarget(
  target: BrowserTarget,
  outRoot = DIST_ROOT
): Promise<string> {
  const version = readPackageVersion();
  const targetDir = join(outRoot, target);

  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(join(targetDir, "content"), { recursive: true });
  mkdirSync(join(targetDir, "icons"), { recursive: true });

  // Ensure icons exist before copying
  if (!existsSync(join(ICONS_SRC_DIR, "icon-128.png"))) {
    generateIcons(ICONS_SRC_DIR);
  }

  // Bundle content script
  const buildResult = await Bun.build({
    entrypoints: [CONTENT_ENTRY_PATH],
    outdir: join(targetDir, "content"),
    target: "browser",
    format: "iife",
    minify: false,
  });

  if (!buildResult.success) {
    const messages = buildResult.logs.map((l) => l.message).join("\n");
    throw new Error(`Failed to bundle content script for ${target}:\n${messages}`);
  }

  // Copy stylesheet
  cpSync(STYLES_SRC_PATH, join(targetDir, "content", "styles.css"));

  // Copy icons
  for (const size of [16, 48, 128]) {
    cpSync(
      join(ICONS_SRC_DIR, `icon-${size}.png`),
      join(targetDir, "icons", `icon-${size}.png`)
    );
  }

  // Write browser-specific Manifest V3
  const manifest = createManifest(target, version);
  writeFileSync(
    join(targetDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  return targetDir;
}

export async function buildAll(outRoot = DIST_ROOT): Promise<string[]> {
  generateIcons(ICONS_SRC_DIR);
  const dirs: string[] = [];
  for (const target of BROWSER_TARGETS) {
    dirs.push(await buildTarget(target, outRoot));
  }
  return dirs;
}

if (import.meta.main) {
  const dirs = await buildAll();
  for (const dir of dirs) {
    console.log(`Built unpacked extension: ${dir}`);
  }
}
