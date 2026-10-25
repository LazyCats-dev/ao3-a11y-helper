# AGENTS.md — AO3 Accessibility Helper

This document provides essential context, architectural invariants, and workflows for AI coding agents working in `ao3-a11y-helper`.

---

## 1. Project Overview

**AO3 Accessibility Helper** is a zero-permission, cross-browser Manifest V3 extension targeting:
- **Google Chrome** (`dist/chrome`)
- **Mozilla Firefox Desktop (109+) & Firefox for Android (120+)** (`dist/firefox`)
- **Microsoft Edge** (`dist/edge`)

The extension runs as a content script on Archive of Our Own (AO3) work and chapter creation/editing pages (`/works/new`, `/works/*/edit`, `/works/*/chapters/new`, `/works/*/chapters/*/edit`, `/chapters/*/edit`) and renders an inline accessibility warning panel directly beneath the work HTML `<textarea>`.

---

## 2. Repository Structure

- `src/linter/` — HTML accessibility linter engine:
  - `types.ts` — `RULE_IDS`, `RuleId`, `Severity`, `A11yWarning`, `SourceLocation`, `LintContext`, and `LintRule` interfaces.
  - `source-locator.ts` — `createSourceIndex(rawHtml)` ($O(\log N)$ binary-searched line/column lookup and single-pass opening-tag index) and `maskPreservedFormatting(rawHtml)`.
  - `element-text.ts` — `getAccessibleText(node)` (DOM-order accessible text combining text nodes and `<img alt>`) and `formatElementSnippet(element)`.
  - `index.ts` — `createLintContext(rawHtml)` (inert `<template>` fragment parser immune to stray closing tags) and `analyzeHtml(rawHtml)` entry point.
  - `rules/` — Modular rule implementations (`images.ts`, `links.ts`, `headings.ts`, `scene-breaks.ts`, `paragraphs.ts`, `tables.ts`, `details.ts`, `semantics.ts`).
- `src/content/` — Content script & UI injected into AO3 pages:
  - `index.ts` — Finds AO3 work/chapter textareas (`#work_chapter_attributes_content`, `#chapter_content`), attaches debounced `input`/`change`/`blur` listeners, and coordinates UI updates via `requestAnimationFrame`.
  - `warning-panel.ts` — Builds the `<section class="listbox group ao3-a11y-panel">` DOM component using AO3's native Site Skin classes (`.listbox`, `.group`, `.heading`, `.index`, `.blurb`, `.notice`, `.actions`, `.action`), manages the polite live region (`aria-live="polite"`), dynamically selects a sequential heading tag (`resolvePanelHeadingTag`), and implements the **"Highlight in HTML"** (`selectLocationInTextarea`) and one-click fix (`applyFixInTextarea`) buttons.
  - `styles.css` — Structural layout stylesheet for `.ao3-a11y-*` that inherits colors, backgrounds, borders, and button styling directly from the active AO3 Site Skin (Default, Reversi, Low Vision Default, Snow Blue, or custom skins) while enforcing WCAG target sizes (`>= 24×24px` desktop, `>= 44px` on `pointer: coarse` / `max-width: 480px`) and Forced Colors (`forced-colors: active`).
- `src/manifests/manifest.base.ts` — Generates browser-specific MV3 `manifest.json` objects and validates `MAJOR.MINOR.PATCH` version strings.
- `scripts/` — Build and packaging scripts (`generate-icons.ts`, `build.ts`, `package.ts`).
- `tests/` — Vitest test suites (`content-ui.test.ts`, `rules-core.test.ts`, `rules-structure.test.ts`, `locator.test.ts`, `build.test.ts`).
- `.github/workflows/` — `ci.yml` (continuous integration) and `publish.yml` (automated publishing to Chrome Web Store, Firefox AMO, and Edge Add-ons).
- `.agent/skills/` — Installed workspace skills for accessibility, Axe rules, content design, and AO3 rule authoring.

---

## 3. Non-Negotiable Invariants

### A. AO3 HTML Sanitizer Compatibility
AO3 strips `aria-*`, `role`, and inline `style` attributes from user-submitted work HTML.
- **Never** recommend `aria-label`, `aria-hidden`, `role="..."`, or inline `style="..."` in `A11yWarning.suggestion`.
- **Always** recommend native HTML elements/attributes permitted by AO3 (`alt="..."`, `alt=""`, `<hr>`, `<p>`, `<h2>`–`<h6>`, `<caption>`, `<th scope="col|row">`, `<details><summary>`, `<abbr title="...">`) or an **AO3 Work Skin**.
- Decorative images with empty `alt=""` are valid and intentional; never flag `alt=""` as an error (unless it is the sole content inside an interactive `<a>` link with no other accessible text).
- Standard 3-dot ellipses (`...`, `…`, `. . .`) used for dialogue beats must not be flagged by `ascii-scene-break`.

### B. Extension UI Accessibility & Real-Browser Axe Testing
- All UI changes in `src/content/` **must** be tested in real headless **Chromium** and **Firefox** via Vitest Browser Mode (`@vitest/browser-playwright`) and pass `runAxe(document.body, { rules: { "target-size": { enabled: true } } })` with zero violations.
- Do **not** replace Vitest Browser Mode with simulated DOM environments (`happy-dom` or `jsdom`); real browser layout is required so `axe-core` evaluates actual `color-contrast` and `target-size` rules.
- Interactive controls in the panel must maintain a minimum `24×24` CSS pixel target size on desktop and `>= 44px` height on coarse pointers / mobile viewports (`360×640`) for Firefox for Android compatibility.
- Keep `permissions` empty (`Zero-Permission Architecture`): rely strictly on static `content_scripts.matches` scoped to `archiveofourown.org`.

### C. Extension Versioning (`MAJOR.MINOR.PATCH`)
- `"version"` in `package.json` is the single source of truth and is validated by `EXTENSION_VERSION_PATTERN` (`/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/`) in `src/manifests/manifest.base.ts`.
- Never use pre-release suffixes (`-beta.1`) or leading zeros (`01.0.0`), as browser extension stores reject them.

---

## 4. Essential Commands

- **Typecheck**:
  ```bash
  bun run typecheck
  ```
- **Run Full Test Suite (Vitest Browser Mode in Chromium & Firefox + Node Build Tests)**:
  ```bash
  bun run test
  ```
- **Build Unpacked Extensions (`dist/chrome`, `dist/firefox`, `dist/edge`)**:
  ```bash
  bun run build
  ```
- **Package Store & Source `.zip` Archives (`release/*.zip`)**:
  ```bash
  bun run package
  ```

---

## 5. Version Control & Workspace Skills

- This repository uses **Jujutsu (`jj`)** colocated with Git. Create small, logical commits with descriptive messages (`jj commit -m "feat(...): ..."`).
- Note that `bun run package` cleans and recreates `release/` (including `ao3-a11y-helper-source-v*.zip`, which bundles `src/`, `scripts/`, `tests/`, `package.json`, `README.md`, etc.).
- Consult the workspace skills in `.agent/skills/` when working on relevant areas:
  - `.agent/skills/ao3-a11y-rules/SKILL.md` — Adding or modifying AO3 HTML linter rules.
  - `.agent/skills/axe-rules/SKILL.md` & `.agent/skills/frontend-a11y/SKILL.md` — WCAG 2.2 AA and `axe-core` rule guidance.
  - `.agent/skills/image-alt-text/SKILL.md`, `.agent/skills/anchor-links/SKILL.md`, `.agent/skills/tables/SKILL.md` — Domain guidance for specific HTML rules.
  - `.agent/skills/aria-live-regions/SKILL.md`, `.agent/skills/color-contrast/SKILL.md`, `.agent/skills/light-dark-mode/SKILL.md`, `.agent/skills/touch-pointer/SKILL.md`, `.agent/skills/keyboard/SKILL.md` — UI accessibility guidance for the injected warning panel.
  - `.agent/skills/plain-language/SKILL.md` & `.agent/skills/content-design/SKILL.md` — Writing clear, non-jargon warning messages and fix suggestions for AO3 authors.
