---
name: ao3-a11y-rules
description: >-
  Use this skill when adding, modifying, or debugging AO3 HTML accessibility linter rules,
  source location tracking, or the AO3 warning panel UI in the ao3-a11y-helper extension.
---

# AO3 HTML Accessibility Rules & Linter Guide

Use this runbook whenever creating or updating accessibility rules in `src/linter/` or modifying how warnings are rendered in `src/content/`.

## 1. AO3 HTML Sanitizer Constraints

Archive of Our Own (AO3) runs a strict HTML sanitizer on work and chapter text before saving:
- **Allowed HTML tags**:
  `a`, `abbr`, `acronym`, `address`, `b`, `big`, `blockquote`, `br`, `caption`, `center`, `cite`, `code`, `col`, `colgroup`, `dd`, `del`, `details`, `dfn`, `div`, `dl`, `dt`, `em`, `figcaption`, `figure`, `font`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `hr`, `i`, `img`, `ins`, `kbd`, `li`, `ol`, `p`, `pre`, `q`, `rp`, `rt`, `ruby`, `s`, `samp`, `small`, `span`, `strike`, `strong`, `sub`, `summary`, `sup`, `table`, `tbody`, `td`, `tfoot`, `th`, `thead`, `tr`, `tt`, `u`, `ul`, `var`
- **Stripped by AO3**:
  - All `aria-*` and `role` attributes
  - Inline `style="..."` attributes
  - `<script>`, `<svg>`, `<video>`, `<audio>`, `<iframe>` (except allowlisted media embeds)

**Rule Authoring Requirement**: Every `A11yWarning.suggestion` MUST recommend fixes that work inside AO3's allowed HTML subset (such as `alt="..."`, `alt=""`, `<hr>`, `<p>`, `<h2>`–`<h6>`, `<caption>`, `<th scope="col|row">`, `<details><summary>`, `<abbr title="...">`) or via an **AO3 Work Skin** (`class="..."`). Never tell authors to add `aria-label`, `role`, or inline `style` attributes in work HTML.

## 2. Adding or Modifying a Linter Rule

1. **Register the `RuleId`** (if adding a new rule category):
   - Add the new rule ID literal to `RULE_IDS` in `src/linter/types.ts`.
2. **Implement the rule function** in `src/linter/rules/<category>.ts`:
   - Signature: `export function check<Category>(context: LintContext): A11yWarning[]`
   - For DOM element checks, query `context.root.querySelectorAll(...)` and resolve the source location using `context.locateElement(element)` and `formatElementSnippet(element)` from `src/linter/element-text.ts`.
   - For raw text / regex checks (such as `ascii-scene-break` or `double-br-paragraphs`), mask out comments and code/pre blocks via `maskPreservedFormatting(context.rawHtml)` before matching so character offsets in `context.source.locateRange(startOffset, endOffset)` remain exact.
3. **Register in `DEFAULT_RULES`**:
   - Add the rule function to `DEFAULT_RULES` in `src/linter/index.ts`.
4. **Document the rule**:
   - Update the rules table in `README.md`.

## 3. Verification Steps

Run all three checks before committing:

```bash
bun run typecheck
bun run test
bun run package
```

- `bun run test` executes Vitest Browser Mode (`@vitest/browser-playwright`) in real headless **Chromium** and **Firefox**, including `axe-core` (`color-contrast`, `target-size`, `heading-order`) and `360×640` Firefox for Android mobile viewport checks.
