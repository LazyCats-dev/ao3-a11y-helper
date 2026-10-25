# <img src="./src/icons/icon-128.png" alt="" width="48" height="48" align="absmiddle"> AO3 Accessibility Helper

A lightweight, zero-permission Manifest V3 browser extension for **Chrome**, **Firefox** (Desktop & **Firefox for Android**), and **Microsoft Edge** that checks your work HTML on **Archive of Our Own (AO3)** for common accessibility issues before you post.

When you open AO3's **Post New Work**, **Edit Work**, **Add Chapter**, or **Edit Chapter** page, the extension adds an **AO3 Accessibility Check** panel directly beneath the work HTML `<textarea>`. As you write or paste your story HTML, it highlights accessibility barriers that can be fixed using AO3's allowed HTML subset and lets you jump directly to the offending line in the editor.

---

## Features & Accessibility Rules Checked

Because AO3 sanitizes HTML and strips custom `aria-*` attributes, every check is tailored specifically to **HTML that AO3 permits** and **common fanfiction formatting patterns**:

| Rule ID | Severity | What It Checks | How to Fix on AO3 |
| :--- | :--- | :--- | :--- |
| `img-missing-alt` | Error | `<img>` tag without an `alt` attribute | Add `alt="Description of artwork"` for informative images, or `alt=""` (empty quotes) for decorative banners/dividers. |
| `img-suspicious-alt` | Warning | `<img>` `alt` text that is only whitespace (`alt=" "`), a filename/URL (`IMG_1234.JPG`), a generic placeholder (`"fanart"`), or starts with `"image of"` / `"picture of"` | Write a concise description of what the image depicts, or use `alt=""` if purely decorative. |
| `ascii-scene-break` | Warning | Paragraphs or lines consisting only of repeated symbols (`***`, `~ * ~`, `---`, `♦ ♦ ♦`) that screen readers read out symbol-by-symbol | Replace symbol scene breaks with a semantic `<hr>` tag (customizable with an AO3 Work Skin), or click **"Replace scene break with \<hr\>"** directly in the warning panel. |
| `heading-hierarchy` | Error / Warning | Empty headings (`<h3></h3>`) or skipped heading levels (`<h2>` jumping directly to `<h4>`) | Ensure headings contain text and step down one level at a time (`<h2>` → `<h3>`). |
| `link-text-clarity` | Error / Warning | Empty `<a>` links, image links missing `alt` text, vague link labels (`"click here"`, `"here"`, `"link"`), or raw URLs as visible link text | Use descriptive link text explaining the destination (e.g., `<a href="...">Read Part 2 of the series</a>`). |
| `fragile-archive-link` | Warning | Temporary storage-server `archive.org` links (`https://ia803204.us.archive.org/16/items/<item>/<file>`) in `href` or `src` attributes that stop working when the Internet Archive moves files | Replace with the permanent `https://archive.org/download/<item>/<file>` format (or click **"Replace with permanent archive.org link"** directly in the warning panel). |
| `double-br-paragraphs` | Warning | Chaining `<br><br>` to fake paragraph breaks instead of `<p>` tags | Wrap paragraphs in `<p>...</p>` tags (or separate paragraphs with blank lines in AO3's editor) so screen readers can navigate paragraph-by-paragraph. |
| `table-accessibility` | Warning | `<table>` elements missing `<th>` header cells, `<caption>`, or `scope="col"` / `scope="row"` | Add `<caption>` and `<th scope="col">` / `<th scope="row">` for data tables, or use a Work Skin instead of layout tables. |
| `details-summary` | Error / Warning | `<details>` missing a `<summary>` label, empty `<summary>`, or headings (`<h1>`–`<h6>`) nested inside `<summary>` | Place a non-empty `<summary>Label</summary>` as the first child of `<details>` without nesting heading tags inside `<summary>`. |
| `deprecated-tags` | Warning | Obsolete presentational tags (`<center>`, `<font>`, `<big>`, `<strike>`, `<tt>`) | Use semantic tags (`<del>`, `<s>`, `<code>`, `<strong>`) or an AO3 Work Skin (`text-align: center`). |
| `abbr-missing-title` | Warning | `<abbr>` or `<acronym>` tag without a `title` attribute | Add `title="Full Expansion"` (e.g., `<abbr title="Archive of Our Own">AO3</abbr>`). |

---

## Prerequisites

- [Bun](https://bun.com) v1.4+

Install dependencies:

```bash
bun install
```

---

## Building the Extension

To compile the extension and generate unpacked bundles for Chrome, Firefox, and Edge:

```bash
bun run build
```

This creates three ready-to-load extension directories:
- `dist/chrome/` — Manifest V3 bundle for Google Chrome / Chromium browsers
- `dist/firefox/` — Manifest V3 bundle with `browser_specific_settings.gecko` (Firefox Desktop 109+) and `browser_specific_settings.gecko_android` (Firefox for Android 120+)
- `dist/edge/` — Manifest V3 bundle for Microsoft Edge

If you ever want to regenerate the PNG icons (`16×16`, `48×48`, `128×128`) directly:

```bash
bun run generate:icons
```

---

## Testing & Type Checking

Run the full Vitest test suite (`@vitest/browser-playwright` runs DOM, linter, and `vitest-axe` / `axe-core` accessibility audits—including real CSS layout, `color-contrast`, and `target-size` checks—inside headless Chromium):

```bash
bun run test
```

Run TypeScript type checking:

```bash
bun run typecheck
```

---

## Loading the Extension Locally in Your Browser

First, run `bun run build` so the `dist/` folders are populated.

### Google Chrome
1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `dist/chrome` directory from this repository.

### Microsoft Edge
1. Open `edge://extensions` in Edge.
2. Enable **Developer mode** in the left sidebar (or top-right toggle).
3. Click **Load unpacked**.
4. Select the `dist/edge` directory from this repository.

### Mozilla Firefox (Desktop & Firefox for Android)
- **Firefox Desktop**:
  1. Open `about:debugging#/runtime/this-firefox` in Firefox.
  2. Click **Load Temporary Add-on…**.
  3. Navigate to `dist/firefox/` and select the `manifest.json` file.
- **Firefox for Android**:
  - Use [`web-ext`](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/) (`bunx web-ext run -s dist/firefox -t firefox-android --adb-device <device-id>`) with USB debugging enabled, or install the signed `.xpi`/`.zip` package via Firefox for Android's custom add-on collection / AMO listing.

---

## Extension Versioning (`MAJOR.MINOR.PATCH`)

The `"version"` field in [`package.json`](./package.json) is the single source of truth for the extension version. Running `bun run build` or `bun run package` validates and copies this version into every target browser's `manifest.json` (`dist/{chrome,firefox,edge}/manifest.json`) and into the packaged `.zip` archive filenames.

### Version Format Requirements
- **Strict `MAJOR.MINOR.PATCH` format**: Versions must consist of three dot-separated non-negative integers (`0` or positive integers without leading zeroes, e.g., `1.0.0`, `1.2.0`, `1.2.3`).
- **No pre-release or build metadata suffixes**: Browser extension manifests (`manifest.json`) and the Chrome Web Store, Firefox Add-ons (AMO), and Microsoft Edge Add-ons reject semver pre-release tags such as `1.0.0-beta.1` or `+build`. The build pipeline enforces `^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$`.
- **Monotonically increasing**: Every store upload must have a strictly higher version number than the currently published version on Chrome Web Store, AMO, and Edge Partner Center.

### When to Increment Each Segment
- **`MAJOR` (`X.0.0`)**: Increment for breaking or major changes, such as:
  - Adding new browser permissions or expanding `content_scripts.matches` host permissions (which may temporarily disable the extension for existing users until they accept the new permissions prompt)
  - Major redesigns of the warning panel UX or workflow
  - Raising minimum supported browser versions (`strict_min_version`)
- **`MINOR` (`1.X.0`)**: Increment for backward-compatible feature additions, such as:
  - Adding new AO3 HTML accessibility rules or checks
  - Supporting additional AO3 editor views or UI enhancements without requiring new permissions
- **`PATCH` (`1.0.X`)**: Increment for backward-compatible bug fixes and refinements, such as:
  - Fixing false positives or false negatives in existing accessibility rules
  - Improving warning explanations, fix suggestions, or CSS styling/contrast

---

## Preparing for Store Deployment

To build and package clean, store-ready `.zip` archives for all three browser stores:

```bash
bun run package
```

This outputs four archives in `release/`:
- `release/ao3-a11y-helper-chrome-v1.0.0.zip` — Chrome Web Store package
- `release/ao3-a11y-helper-firefox-v1.0.0.zip` — Firefox Add-ons (Desktop & Android) package
- `release/ao3-a11y-helper-edge-v1.0.0.zip` — Microsoft Edge Add-ons package
- `release/ao3-a11y-helper-source-v1.0.0.zip` — Clean source code bundle for Mozilla Add-ons (AMO) review

Each browser `.zip` archive contains **only** the compiled `manifest.json`, `content/index.js`, `content/styles.css`, and `icons/icon-{16,48,128}.png` at the root of the archive (excluding `.git/`, `node_modules/`, tests, and markdown docs).

### Automated GitHub Actions Store Deployment

Two GitHub Actions workflows are configured in `.github/workflows/`:
- **[`.github/workflows/ci.yml`](./.github/workflows/ci.yml)**: Runs on every push to `main` and pull request—executes `bun run typecheck`, `bun run test` (Vitest Browser Mode in headless Chromium & Firefox), and `bun run package`.
- **[`.github/workflows/publish.yml`](./.github/workflows/publish.yml)**: Runs automatically when a GitHub Release is published (or manually via `workflow_dispatch`) and deploys to all three extension stores in parallel using [`wdzeng/chrome-extension@v2`](https://github.com/wdzeng/chrome-extension), [`wdzeng/firefox-addon@v2`](https://github.com/wdzeng/firefox-addon), and [`wdzeng/edge-addon@v2`](https://github.com/wdzeng/edge-addon).

Configure the following repository secrets in **Settings → Secrets and variables → Actions** after completing the initial first-time manual upload on each store:

| Store | Secret Name | Description |
| :--- | :--- | :--- |
| **Chrome Web Store** | `CHROME_EXTENSION_ID` | 32-character Extension ID from the Chrome Developer Dashboard |
| **Chrome Web Store** | `CHROME_PUBLISHER_ID` | Publisher ID from the Chrome Developer Dashboard Account page |
| **Chrome Web Store** | `CHROME_CLIENT_ID` | Google Cloud OAuth2 Client ID with Chrome Web Store API enabled |
| **Chrome Web Store** | `CHROME_CLIENT_SECRET` | Google Cloud OAuth2 Client Secret |
| **Chrome Web Store** | `CHROME_REFRESH_TOKEN` | OAuth2 Refresh Token for the Chrome Web Store API |
| **Firefox Add-ons (AMO)** | `FIREFOX_ADDON_GUID` | Optional override for add-on ID (defaults to `ao3-a11y-helper@archiveofourown.org`) |
| **Firefox Add-ons (AMO)** | `FIREFOX_JWT_ISSUER` | API Key (JWT issuer) from [AMO Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/) |
| **Firefox Add-ons (AMO)** | `FIREFOX_JWT_SECRET` | API Secret (JWT secret) from AMO Manage API Keys |
| **Microsoft Edge Add-ons** | `EDGE_PRODUCT_ID` | Product ID (GUID) from the Edge Partner Center listing |
| **Microsoft Edge Add-ons** | `EDGE_CLIENT_ID` | Client ID from Edge Partner Center → Publish API |
| **Microsoft Edge Add-ons** | `EDGE_API_KEY` | API Key (Client Secret) from Edge Partner Center → Publish API |

### Store Submission Checklist
1. **Chrome Web Store ([Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole))**:
   - Upload `release/ao3-a11y-helper-chrome-v1.0.0.zip`.
   - Copy listing metadata, permissions justification, and privacy disclosures from [`CHROMEWEBSTORE.md`](./CHROMEWEBSTORE.md).
   - Because the extension uses zero API permissions (`permissions: []`) and runs strictly on `archiveofourown.org` work editor pages without collecting any user data, review is straightforward.
2. **Firefox Add-ons ([AMO Developer Hub](https://addons.mozilla.org/developers/))**:
   - Upload `release/ao3-a11y-helper-firefox-v1.0.0.zip`.
   - When prompted whether source code submission is required, you can optionally attach a zip of the repository (`src/`, `scripts/`, `package.json`, `README.md`) with build instructions: `bun install && bun run build`.
3. **Microsoft Edge Add-ons ([Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview))**:
   - Upload `release/ao3-a11y-helper-edge-v1.0.0.zip`.
   - Provide the store description and screenshots from [`CHROMEWEBSTORE.md`](./CHROMEWEBSTORE.md).
