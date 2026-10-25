export type BrowserTarget = "chrome" | "firefox" | "edge";

export const AO3_CONTENT_MATCHES = [
  "https://archiveofourown.org/works/new*",
  "https://archiveofourown.org/works/*/edit*",
  "https://archiveofourown.org/works/*/chapters/new*",
  "https://archiveofourown.org/works/*/chapters/*/edit*",
  "https://archiveofourown.org/chapters/*/edit*",
  "https://*.archiveofourown.org/works/new*",
  "https://*.archiveofourown.org/works/*/edit*",
  "https://*.archiveofourown.org/works/*/chapters/new*",
  "https://*.archiveofourown.org/works/*/chapters/*/edit*",
  "https://*.archiveofourown.org/chapters/*/edit*",
] as const;

export interface ExtensionManifest {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  icons: {
    "16": string;
    "48": string;
    "128": string;
  };
  content_scripts: Array<{
    matches: readonly string[];
    js: string[];
    css: string[];
    run_at: "document_idle";
  }>;
  browser_specific_settings?: {
    gecko: {
      id: string;
      strict_min_version: string;
    };
    gecko_android: {
      strict_min_version: string;
    };
  };
}

export const EXTENSION_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export function createManifest(
  target: BrowserTarget,
  version = "1.0.0"
): ExtensionManifest {
  if (!EXTENSION_VERSION_PATTERN.test(version)) {
    throw new Error(
      `Invalid extension version "${version}". Expected strict MAJOR.MINOR.PATCH format (e.g. "1.0.0") with no pre-release suffixes or leading zeros.`
    );
  }

  const base: ExtensionManifest = {
    manifest_version: 3,
    name: "AO3 Accessibility Helper",
    version,
    description:
      "Checks work HTML on Archive of Our Own (AO3) for common accessibility issues before posting.",
    icons: {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
    content_scripts: [
      {
        matches: AO3_CONTENT_MATCHES,
        js: ["content/index.js"],
        css: ["content/styles.css"],
        run_at: "document_idle",
      },
    ],
  };

  if (target === "firefox") {
    base.browser_specific_settings = {
      gecko: {
        id: "ao3-a11y-helper@archiveofourown.org",
        strict_min_version: "109.0",
      },
      gecko_android: {
        strict_min_version: "120.0",
      },
    };
  }

  return base;
}
